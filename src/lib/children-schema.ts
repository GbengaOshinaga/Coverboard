import { z } from "zod";
import { UPL_WEEKS_PER_CHILD } from "@/lib/unpaid-parental";

/** A child, for unpaid parental leave: date of birth and an optional label. */
export const childSchema = z.object({
  label: z.string().trim().max(60).optional().nullable(),
  dateOfBirth: z
    .string()
    .date()
    .refine((s) => new Date(`${s}T00:00:00Z`) <= new Date(), "Date of birth can't be in the future"),
  weeksTakenElsewhere: z.number().int().min(0).max(UPL_WEEKS_PER_CHILD).optional(),
});
