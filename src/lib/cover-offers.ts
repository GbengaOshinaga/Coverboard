import { parseISO } from "date-fns";
import { prisma } from "@/lib/prisma";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { computeDailyCover } from "@/lib/regionCover";
import { sendEmail } from "@/lib/email";
import { coverChangedEmail, coverOfferAnsweredEmail, coverOfferEmail } from "@/lib/email-templates";
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

type OfferShiftDetails = { shiftName: string; date: Date; startTime: string; endTime: string; locationName: string };

function emailOffer(person: { name: string; email: string }, managerName: string, shifts: OfferShiftDetails[]) {
  if (shifts.length === 0) return;
  const { subject, html } = coverOfferEmail({
    recipientName: person.name,
    managerName,
    shifts,
    url: `${getAppBaseUrl()}/cover-requests`,
  });
  sendEmail({ to: person.email, subject, html }).catch((err) =>
    console.error("Cover offer email error:", err)
  );
}

/** Ask one person to cover one shift, and email them. */
export async function createCoverOffer(
  input: Parameters<typeof createOfferRow>[0]
): Promise<OfferResult<{ offerId: string }>> {
  const result = await createOfferRow(input);
  if (!result.ok) return result;
  emailOffer(result.person, input.actor.name ?? "Your manager", [result.details]);
  return { ok: true, offerId: result.offerId };
}

/**
 * Ask one person to cover several shifts at once ("Ask for all"): each shift
 * is checked and created on its own, then one email lists the ones that
 * went out. Returns a result per shift, in order.
 */
export async function createCoverOffers(input: {
  userId: string;
  shifts: Array<{ shiftTypeId: string; date: string }>;
  leaveRequestId?: string;
  actor: Actor;
  organizationId: string;
  context?: AuditContext;
}): Promise<Array<{ shiftTypeId: string; date: string } & OfferResult<{ offerId: string }>>> {
  const results: Array<{ shiftTypeId: string; date: string } & OfferResult<{ offerId: string }>> = [];
  const sent: OfferShiftDetails[] = [];
  let person: { name: string; email: string } | null = null;
  for (const s of input.shifts) {
    const r = await createOfferRow({ ...input, ...s });
    if (r.ok) {
      person = r.person;
      sent.push(r.details);
      results.push({ ...s, ok: true, offerId: r.offerId });
    } else {
      results.push({ ...s, ...r });
    }
  }
  if (person) emailOffer(person, input.actor.name ?? "Your manager", sent);
  return results;
}

async function createOfferRow(input: {
  shiftTypeId: string;
  date: string;
  userId: string;
  leaveRequestId?: string;
  actor: Actor;
  organizationId: string;
  context?: AuditContext;
}): Promise<
  | { ok: true; offerId: string; person: { name: string; email: string }; details: OfferShiftDetails }
  | { ok: false; status: number; error: string }
> {
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

  recordAudit({
    organizationId,
    action: "cover_offer.created",
    resource: "cover_offer",
    resourceId: offer.id,
    actor,
    metadata: { shift: shift.name, location: shift.region.name, date, offeredTo: { id: userId, name: person.name } },
    context,
  });
  return {
    ok: true,
    offerId: offer.id,
    person,
    details: {
      shiftName: shift.name,
      date: toDbDate(date),
      startTime: shift.startTime,
      endTime: shift.endTime,
      locationName: shift.region.name,
    },
  };
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

/**
 * A manager withdraws an ask. Unanswered asks just close; an accepted one
 * takes the person off the shift (the gap reopens) and emails them.
 */
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
  const offer = await prisma.coverOffer.findFirst({
    where: { id: offerId, organizationId },
    select: {
      status: true,
      date: true,
      shiftTypeId: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!offer || (offer.status !== "PENDING" && offer.status !== "ACCEPTED")) {
    return { ok: false, status: 409, error: "This request has already closed." };
  }
  const wasAccepted = offer.status === "ACCEPTED";
  const updated = await prisma.coverOffer.updateMany({
    where: { id: offerId, status: offer.status },
    data: { status: "CANCELLED" },
  });
  if (updated.count === 0) {
    return { ok: false, status: 409, error: "This request changed meanwhile. Refresh and try again." };
  }

  if (wasAccepted) {
    const shift = await loadShift(offer.shiftTypeId, organizationId);
    if (shift) {
      const { subject, html } = coverChangedEmail({
        recipientName: offer.user.name,
        headline: `You're no longer needed for the ${shift.name} shift`,
        message: `${actor.name ?? "Your manager"} has taken you off this shift. You don't need to come in for it.`,
        shiftName: shift.name,
        date: offer.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        locationName: shift.region.name,
        url: `${getAppBaseUrl()}/cover-requests`,
        buttonText: "View your cover requests",
      });
      sendEmail({ to: offer.user.email, subject, html }).catch((err) =>
        console.error("Cover withdrawn email error:", err)
      );
    }
  }

  recordAudit({
    organizationId,
    action: "cover_offer.cancelled",
    resource: "cover_offer",
    resourceId: offerId,
    actor,
    metadata: { wasAccepted, person: offer.user.name, date: offer.date.toISOString().slice(0, 10) },
    context,
  });
  return { ok: true };
}

/**
 * The person drops out of a shift they'd accepted (before it starts). The
 * gap reopens and whoever asked them is emailed.
 */
export async function dropOutOfCover(input: {
  offerId: string;
  actor: Actor;
  organizationId: string;
  context?: AuditContext;
}): Promise<OfferResult> {
  const { offerId, actor, organizationId, context } = input;
  const offer = await prisma.coverOffer.findFirst({
    where: { id: offerId, organizationId },
    select: {
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
  if (offer.status !== "ACCEPTED") {
    return { ok: false, status: 409, error: "You can only drop out of a shift you've accepted." };
  }
  const shift = await loadShift(offer.shiftTypeId, organizationId);
  if (!shift) return { ok: false, status: 404, error: "Shift not found" };
  const date = offer.date.toISOString().slice(0, 10);
  if (date < todayIso()) {
    return { ok: false, status: 409, error: "This shift has already happened." };
  }

  const updated = await prisma.coverOffer.updateMany({
    where: { id: offerId, status: "ACCEPTED" },
    data: { status: "WITHDRAWN", respondedAt: new Date() },
  });
  if (updated.count === 0) {
    return { ok: false, status: 409, error: "This request changed meanwhile. Refresh and try again." };
  }

  if (offer.offeredBy?.email) {
    const { subject, html } = coverChangedEmail({
      recipientName: offer.offeredBy.name,
      headline: `${offer.user.name} can no longer cover the ${shift.name} shift`,
      message: `${offer.user.name} has dropped out, so this shift is short again. You can ask someone else from the cover view.`,
      shiftName: shift.name,
      date: offer.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      locationName: shift.region.name,
      url: `${getAppBaseUrl()}/dashboard`,
      buttonText: "Find cover",
    });
    sendEmail({ to: offer.offeredBy.email, subject, html }).catch((err) =>
      console.error("Cover dropped email error:", err)
    );
  }

  recordAudit({
    organizationId,
    action: "cover_offer.withdrawn",
    resource: "cover_offer",
    resourceId: offerId,
    actor,
    metadata: { shift: shift.name, location: shift.region.name, date },
    context,
  });
  return { ok: true };
}

/**
 * Answers to asks this manager sent in the last 7 days: the in-app notice,
 * so nobody has to rely on email or refresh a page to find out.
 */
export async function recentCoverAnswers(managerId: string, organizationId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.coverOffer.findMany({
    where: {
      organizationId,
      offeredById: managerId,
      status: { in: ["ACCEPTED", "DECLINED", "WITHDRAWN"] },
      respondedAt: { gte: since },
    },
    orderBy: { respondedAt: "desc" },
    take: 8,
    select: {
      id: true,
      status: true,
      date: true,
      respondedAt: true,
      user: { select: { name: true } },
      shiftType: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status as "ACCEPTED" | "DECLINED" | "WITHDRAWN",
    date: r.date.toISOString().slice(0, 10),
    personName: r.user.name,
    shiftName: r.shiftType.name,
  }));
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
