/**
 * Fit-note coverage for one sickness absence. Days 1–7 are self-certified;
 * from day 8 (calendar days, weekends included) the absence needs fit notes
 * covering every day through its end date.
 *
 * Dates are UTC-midnight Dates (how the app stores leave and fit-note dates).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const SELF_CERT_DAYS = 7;

function dayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export type FitNoteRange = { coversFrom: Date; coversTo: Date };

export type FitNoteStatus =
  | { required: false }
  | {
      required: true;
      /** Day 8 of the absence: the first day a fit note must cover. */
      requiredFrom: Date;
      /** First day not covered by any fit note, or null when fully covered. */
      neededFrom: Date | null;
      fullyCovered: boolean;
    };

export function fitNoteStatus(
  absence: { startDate: Date; endDate: Date },
  notes: ReadonlyArray<FitNoteRange>
): FitNoteStatus {
  const start = dayStart(absence.startDate);
  const end = dayStart(absence.endDate);
  if ((end - start) / DAY_MS + 1 <= SELF_CERT_DAYS) return { required: false };

  const requiredFrom = start + SELF_CERT_DAYS * DAY_MS;
  // Walk notes in start order, extending the covered run while each one
  // starts on or before the first uncovered day.
  const sorted = [...notes]
    .map((n) => ({ from: dayStart(n.coversFrom), to: dayStart(n.coversTo) }))
    .sort((a, b) => a.from - b.from);
  let cursor = requiredFrom;
  for (const n of sorted) {
    if (n.from > cursor) break;
    if (n.to >= cursor) cursor = n.to + DAY_MS;
  }
  const fullyCovered = cursor > end;
  return {
    required: true,
    requiredFrom: new Date(requiredFrom),
    neededFrom: fullyCovered ? null : new Date(cursor),
    fullyCovered,
  };
}

/**
 * The value to store in `LeaveRequest.evidenceProvided` (which the overdue
 * reports and the weekly alert read). Absences of 7 days or fewer keep
 * whatever they had: self-certification needs no fit note.
 */
export function evidenceFromFitNotes(status: FitNoteStatus, current: boolean): boolean {
  return status.required ? status.fullyCovered : current;
}
