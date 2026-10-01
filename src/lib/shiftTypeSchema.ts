import { z } from "zod";
import { isValidTime } from "@/lib/shiftCover";

const time = z
  .string()
  .trim()
  .refine(isValidTime, "Times must be HH:MM (24-hour)");

const shiftFields = {
  name: z.string().trim().min(1, "Name is required").max(60),
  startTime: time,
  endTime: time,
  minCoverByWeekday: z
    .array(z.number().int().min(0).max(1000))
    .length(7, "Give a minimum for each day, Monday to Sunday"),
  sortOrder: z.number().int().min(0).max(1000).optional(),
};

export const shiftTypeCreateSchema = z
  .object(shiftFields)
  .strict()
  .refine((s) => s.startTime !== s.endTime, "Start and end times can't be the same");

export const shiftTypeUpdateSchema = z
  .object({
    name: shiftFields.name.optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    minCoverByWeekday: shiftFields.minCoverByWeekday.optional(),
    sortOrder: shiftFields.sortOrder,
  })
  .strict();

export const workPatternSchema = z
  .object({
    entries: z
      .array(
        z.object({
          shiftTypeId: z.string().min(1),
          weekday: z.number().int().min(0).max(6),
        })
      )
      .max(7 * 20),
  })
  .strict();
