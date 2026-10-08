import { z } from "zod";
import { UPL_WEEKS_PER_CHILD } from "@/lib/unpaid-parental";

/**
 * A child, for unpaid parental leave: date of birth and an optional label,
 * plus a placement date if adopted and whether they get a disability benefit.
 */
export const childSchema = z.object({
  label: z.string().trim().max(60).optional().nullable(),
  dateOfBirth: z
    .string()
    .date()
    .refine((s) => new Date(`${s}T00:00:00Z`) <= new Date(), "Date of birth can't be in the future"),
  weeksTakenElsewhere: z.number().int().min(0).max(UPL_WEEKS_PER_CHILD).optional(),
  placedOn: z.string().date().optional().nullable(),
  disabilityBenefit: z.boolean().optional(),
});

/** Placement can't be before the birth (checked once both dates are known). */
export function placedOnError(dateOfBirth: string, placedOn: string | null | undefined): string | null {
  return placedOn && placedOn < dateOfBirth ? "The placement date can't be before the date of birth" : null;
}

type ChildFacts = {
  dateOfBirth: string;
  placedOn: string | null;
  disabilityBenefit: boolean;
  weeksTakenElsewhere: number;
};

/**
 * Who may change what. These details set the unpaid parental leave limits,
 * so anything that would allow more leave (the disability benefit, which
 * allows single days; fewer weeks taken elsewhere) is for an admin or
 * manager to confirm, and the dates can't be moved by the employee once leave
 * is booked. Nobody can move the dates so that booked leave would fall
 * before the child was born or placed, or on or after their 18th birthday.
 * `before` is null when adding a child.
 */
export function childChangeError(input: {
  canApprove: boolean;
  before: ChildFacts | null;
  after: ChildFacts;
  /** The child's live (pending or approved) bookings, YYYY-MM-DD. */
  bookings: { startDate: string; endDate: string }[];
}): string | null {
  const { before, after, bookings } = input;
  if (!input.canApprove) {
    if (after.disabilityBenefit && !before?.disabilityBenefit) {
      return "Ask an admin or manager to record the disability benefit – it lets leave be taken in single days.";
    }
    if (before && after.weeksTakenElsewhere < before.weeksTakenElsewhere) {
      return "Ask an admin or manager to lower the weeks taken with other employers.";
    }
    if (
      before &&
      bookings.length > 0 &&
      (after.dateOfBirth !== before.dateOfBirth || after.placedOn !== before.placedOn)
    ) {
      return "This child has unpaid parental leave booked, so ask an admin or manager to change their dates.";
    }
  }
  if (bookings.length > 0) {
    const responsible = after.placedOn ?? after.dateOfBirth;
    const [y, m, d] = after.dateOfBirth.split("-");
    const eighteenth = `${Number(y) + 18}-${m}-${d}`;
    if (bookings.some((b) => b.startDate < responsible)) {
      return after.placedOn
        ? "Leave is already booked before that placement date. Cancel or move it first."
        : "Leave is already booked before that date of birth. Cancel or move it first.";
    }
    if (bookings.some((b) => b.endDate >= eighteenth)) {
      return "Leave is already booked on or after the 18th birthday that date gives. Cancel or move it first.";
    }
  }
  return null;
}
