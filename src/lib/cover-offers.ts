import { parseISO } from "date-fns";
import { prisma } from "@/lib/prisma";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { computeDailyCover } from "@/lib/regionCover";
import { sendEmail } from "@/lib/email";
import { coverOfferAnsweredEmail, coverOfferEmail } from "@/lib/email-templates";
import { getAppBaseUrl } from "@/lib/app-url";
import type { ShiftCover } from "@/lib/shiftCover";

/**
 * Cover offers: a manager asks someone to cover a short shift; they accept
 * or decline in the app. Accepting puts them on the shift for that date
 * (the cover engine reads accepted offers as one-off assignments).
 *
 * Every step re-checks the live cover picture, so an offer can't be made or
 * accepted for a shift that's already covered, or by someone who's since gone
 * on leave or would break the 11-hour rest rule.
 */

type Actor = { id: string; email: string | null; role: string; name?: string };
export type OfferResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; status: number; error: string };

const toDbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const todayIso = () => new Date().toISOString().slice(0, 10);

async function loadShift(shiftTypeId: string, organizationId: string) {
  return prisma.shiftType.findFirst({
    where: { id: shiftTypeId, region: { organizationId } },
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
      region: { select: { id: true, name: true } },
    },
  });
}

/** The live cover for one shift on one date, including accepted offers. */
async function shiftCoverOn(
  organizationId: string,
  regionId: string,
  shiftTypeId: string,
  date: string
): Promise<ShiftCover | null> {
  const [day] = await computeDailyCover({
    organizationId,
    regionId,
    start: parseISO(date),
    end: parseISO(date),
  });
  return day?.shifts.find((s) => s.shiftId === shiftTypeId) ?? null;
}

const isShort = (s: ShiftCover) => s.coverRequired && s.available < s.required;

/** Why someone can't take this shift right now, or null if they can. */
function cannotCover(cover: ShiftCover | null, userId: string): string | null {
  if (!cover || !isShort(cover)) return "This shift isn't short any more.";
  if (cover.scheduledUserIds.includes(userId)) return "They're already on this shift.";
  const out = cover.ruledOut.find((o) => o.id === userId);
  if (out) {
    return out.reason === "rest"
      ? `They wouldn't get 11 hours' rest (${out.note}).`
      : "They're on leave that day.";
  }
  if (!cover.coverCandidates.some((c) => c.id === userId)) {
    return "They aren't in this shift's location.";
  }
  return null;
}

export async function createCoverOffer(input: {
  shiftTypeId: string;
  date: string;
  userId: string;
  leaveRequestId?: string;
  actor: Actor;
  organizationId: string;
  context?: AuditContext;
}): Promise<OfferResult<{ offerId: string }>> {
  const { shiftTypeId, date, userId, leaveRequestId, actor, organizationId, context } = input;
  if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
    return { ok: false, status: 403, error: "Only admins and managers can ask someone to cover." };
  }
  if (date < todayIso()) {
    return { ok: false, status: 400, error: "That shift has already happened." };
  }
  const shift = await loadShift(shiftTypeId, organizationId);
  if (!shift) return { ok: false, status: 404, error: "Shift not found" };

  const person = await prisma.user.findFirst({
    where: { id: userId, organizationId, isActive: true },
    select: { name: true, email: true },
  });
  if (!person) return { ok: false, status: 404, error: "Team member not found" };

  const existing = await prisma.coverOffer.findFirst({
    where: { shiftTypeId, date: toDbDate(date), userId, status: { in: ["PENDING", "ACCEPTED"] } },
    select: { status: true },
  });
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: existing.status === "ACCEPTED" ? `${person.name} is already covering it.` : `${person.name} has already been asked.`,
    };
  }

  const cover = await shiftCoverOn(organizationId, shift.region.id, shiftTypeId, date);
  const reason = cannotCover(cover, userId);
  if (reason) return { ok: false, status: 409, error: reason };

  const offer = await prisma.coverOffer.create({
    data: {
      organizationId,
      shiftTypeId,
      date: toDbDate(date),
      userId,
      offeredById: actor.id,
      leaveRequestId: leaveRequestId ?? null,
    },
    select: { id: true },
  });

  const { subject, html } = coverOfferEmail({
    recipientName: person.name,
    managerName: actor.name ?? "Your manager",
    shiftName: shift.name,
    date: toDbDate(date),
    startTime: shift.startTime,
    endTime: shift.endTime,
    locationName: shift.region.name,
    url: `${getAppBaseUrl()}/cover-requests`,
  });
  sendEmail({ to: person.email, subject, html }).catch((err) =>
    console.error("Cover offer email error:", err)
  );

  recordAudit({
    organizationId,
    action: "cover_offer.created",
    resource: "cover_offer",
    resourceId: offer.id,
    actor,
    metadata: { shift: shift.name, location: shift.region.name, date, offeredTo: { id: userId, name: person.name } },
    context,
  });
  return { ok: true, offerId: offer.id };
}

export async function respondToCoverOffer(input: {
  offerId: string;
  accept: boolean;
  actor: Actor;
  organizationId: string;
  context?: AuditContext;
}): Promise<OfferResult<{ status: "ACCEPTED" | "DECLINED" | "FILLED" }>> {
  const { offerId, accept, actor, organizationId, context } = input;
  const offer = await prisma.coverOffer.findFirst({
    where: { id: offerId, organizationId },
    select: {
      id: true,
      userId: true,
      status: true,
      date: true,
      shiftTypeId: true,
      offeredBy: { select: { name: true, email: true } },
      user: { select: { name: true } },
    },
  });
  if (!offer || offer.userId !== actor.id) {
    return { ok: false, status: 404, error: "Cover request not found" };
  }
  if (offer.status !== "PENDING") {
    return {
      ok: false,
      status: 409,
      error:
        offer.status === "FILLED"
          ? "Thanks — this shift has already been covered."
          : offer.status === "CANCELLED"
            ? "This request was withdrawn."
            : "You've already answered this request.",
    };
  }
  const shift = await loadShift(offer.shiftTypeId, organizationId);
  if (!shift) return { ok: false, status: 404, error: "Shift not found" };
  const date = offer.date.toISOString().slice(0, 10);

  let finalStatus: "ACCEPTED" | "DECLINED" | "FILLED" = "DECLINED";
  if (accept) {
    // One accept at a time per shift and date, so two people can't both fill
    // a one-person gap. The lock is released when the transaction ends.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${offer.shiftTypeId}|${date}`}))`;
      const cover = await shiftCoverOn(organizationId, shift.region.id, offer.shiftTypeId, date);
      if (!cover || !isShort(cover)) {
        await tx.coverOffer.update({ where: { id: offerId }, data: { status: "FILLED", respondedAt: new Date() } });
        return { status: "FILLED" as const };
      }
      const reason = cannotCover(cover, actor.id);
      if (reason) return { error: reason.replace("They're", "You're").replace("They wouldn't", "You wouldn't").replace("They aren't", "You aren't") };
      await tx.coverOffer.update({ where: { id: offerId }, data: { status: "ACCEPTED", respondedAt: new Date() } });
      // Closing the gap closes the other open asks for it.
      if (cover.available + 1 >= cover.required) {
        await tx.coverOffer.updateMany({
          where: { shiftTypeId: offer.shiftTypeId, date: offer.date, status: "PENDING", id: { not: offerId } },
          data: { status: "FILLED" },
        });
      }
      return { status: "ACCEPTED" as const };
    });
    if ("error" in outcome) return { ok: false, status: 409, error: outcome.error! };
    finalStatus = outcome.status;
    if (finalStatus === "FILLED") {
      return { ok: true, status: "FILLED" };
    }
  } else {
    await prisma.coverOffer.update({ where: { id: offerId }, data: { status: "DECLINED", respondedAt: new Date() } });
  }

  if (offer.offeredBy?.email) {
    const { subject, html } = coverOfferAnsweredEmail({
      managerName: offer.offeredBy.name,
      responderName: offer.user.name,
      accepted: finalStatus === "ACCEPTED",
      shiftName: shift.name,
      date: offer.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      locationName: shift.region.name,
      url: `${getAppBaseUrl()}/dashboard`,
    });
    sendEmail({ to: offer.offeredBy.email, subject, html }).catch((err) =>
      console.error("Cover answer email error:", err)
    );
  }

  recordAudit({
    organizationId,
    action: finalStatus === "ACCEPTED" ? "cover_offer.accepted" : "cover_offer.declined",
    resource: "cover_offer",
    resourceId: offerId,
    actor,
    metadata: { shift: shift.name, location: shift.region.name, date },
    context,
  });
  return { ok: true, status: finalStatus };
}

/** A manager withdraws an ask that hasn't been answered yet. */
export async function cancelCoverOffer(input: {
  offerId: string;
  actor: Actor;
  organizationId: string;
  context?: AuditContext;
}): Promise<OfferResult> {
  const { offerId, actor, organizationId, context } = input;
  if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
    return { ok: false, status: 403, error: "Only admins and managers can withdraw a cover request." };
  }
  const updated = await prisma.coverOffer.updateMany({
    where: { id: offerId, organizationId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (updated.count === 0) {
    return { ok: false, status: 409, error: "Only unanswered requests can be withdrawn." };
  }
  recordAudit({
    organizationId,
    action: "cover_offer.cancelled",
    resource: "cover_offer",
    resourceId: offerId,
    actor,
    context,
  });
  return { ok: true };
}

/** What someone has been asked to cover: open asks first, then recent answers. */
export async function listCoverOffersFor(userId: string, organizationId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.coverOffer.findMany({
    where: {
      userId,
      organizationId,
      OR: [
        { status: "PENDING", date: { gte: toDbDate(todayIso()) } },
        { status: { not: "PENDING" }, createdAt: { gte: since } },
      ],
    },
    orderBy: [{ date: "asc" }],
    select: {
      id: true,
      date: true,
      status: true,
      offeredBy: { select: { name: true } },
      shiftType: { select: { name: true, startTime: true, endTime: true, region: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    status: r.status,
    offeredBy: r.offeredBy?.name ?? null,
    shiftName: r.shiftType.name,
    startTime: r.shiftType.startTime,
    endTime: r.shiftType.endTime,
    locationName: r.shiftType.region.name,
  }));
}
