import { prisma } from "@/lib/prisma";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { evidenceFromFitNotes, fitNoteStatus } from "@/lib/fit-notes";
import { isSicknessLeaveTypeName } from "./rules";

type Actor = { id: string; email: string | null; role: string };
type Result = { ok: true } | { ok: false; status: number; error: string };

/**
 * Keeps `evidenceProvided` (read by the overdue-fit-note report and weekly
 * alert) in step with the fit notes recorded against an absence. Call after
 * any change to its fit notes or its dates.
 */
export async function syncFitNoteEvidence(requestId: string): Promise<void> {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: {
      startDate: true,
      endDate: true,
      evidenceProvided: true,
      fitNotes: { select: { coversFrom: true, coversTo: true } },
    },
  });
  if (!request) return;
  const next = evidenceFromFitNotes(fitNoteStatus(request, request.fitNotes), request.evidenceProvided);
  if (next !== request.evidenceProvided) {
    await prisma.leaveRequest.update({ where: { id: requestId }, data: { evidenceProvided: next } });
  }
}

async function loadSicknessForManager(requestId: string, organizationId: string, actor: Actor) {
  if (actor.role !== "ADMIN" && actor.role !== "MANAGER") {
    return { error: { ok: false as const, status: 403, error: "Only admins and managers can record fit notes." } };
  }
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      userId: true,
      status: true,
      user: { select: { name: true, organizationId: true } },
      leaveType: { select: { name: true } },
    },
  });
  if (!request || request.user.organizationId !== organizationId) {
    return { error: { ok: false as const, status: 404, error: "Leave request not found" } };
  }
  if (!isSicknessLeaveTypeName(request.leaveType.name)) {
    return { error: { ok: false as const, status: 400, error: "Fit notes only apply to sickness absences." } };
  }
  return { request };
}

/** Records a fit note's dates. No document or medical details are stored. */
export async function recordFitNote(input: {
  requestId: string;
  coversFrom: Date;
  coversTo: Date;
  receivedOn: Date;
  actor: Actor;
  organizationId: string;
  context?: AuditContext;
}): Promise<Result> {
  const { requestId, coversFrom, coversTo, receivedOn, actor, organizationId, context } = input;
  const loaded = await loadSicknessForManager(requestId, organizationId, actor);
  if ("error" in loaded) return loaded.error!;
  const { request } = loaded;
  if (request.status !== "APPROVED" && request.status !== "PENDING") {
    return { ok: false, status: 400, error: `This absence has been ${request.status.toLowerCase()}.` };
  }
  if (coversTo < coversFrom) {
    return { ok: false, status: 400, error: "The fit note can't end before it starts." };
  }

  const note = await prisma.fitNote.create({
    data: { leaveRequestId: requestId, coversFrom, coversTo, receivedOn, recordedById: actor.id },
    select: { id: true },
  });
  await syncFitNoteEvidence(requestId);

  recordAudit({
    organizationId,
    action: "leave_request.fit_note_recorded",
    resource: "leave_request",
    resourceId: requestId,
    actor,
    metadata: {
      employee: { id: request.userId, name: request.user.name },
      fitNoteId: note.id,
      coversFrom,
      coversTo,
      receivedOn,
    },
    context,
  });
  return { ok: true };
}

export async function removeFitNote(input: {
  requestId: string;
  fitNoteId: string;
  actor: Actor;
  organizationId: string;
  context?: AuditContext;
}): Promise<Result> {
  const { requestId, fitNoteId, actor, organizationId, context } = input;
  const loaded = await loadSicknessForManager(requestId, organizationId, actor);
  if ("error" in loaded) return loaded.error!;
  const { request } = loaded;

  const note = await prisma.fitNote.findFirst({
    where: { id: fitNoteId, leaveRequestId: requestId },
    select: { coversFrom: true, coversTo: true },
  });
  if (!note) return { ok: false, status: 404, error: "Fit note not found" };

  await prisma.fitNote.delete({ where: { id: fitNoteId } });
  await syncFitNoteEvidence(requestId);

  recordAudit({
    organizationId,
    action: "leave_request.fit_note_removed",
    resource: "leave_request",
    resourceId: requestId,
    actor,
    metadata: {
      employee: { id: request.userId, name: request.user.name },
      fitNoteId,
      coversFrom: note.coversFrom,
      coversTo: note.coversTo,
    },
    context,
  });
  return { ok: true };
}
