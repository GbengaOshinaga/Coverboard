import { z } from "zod";

export const leaveRequestSchema = z
  .object({
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    leaveTypeId: z.string().min(1, "Leave type is required"),
    note: z.string().optional(),
  })
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      return end >= start;
    },
    { message: "End date must be on or after start date", path: ["endDate"] }
  );

export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const teamMemberSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]),
  memberType: z.enum(["EMPLOYEE", "CONTRACTOR", "FREELANCER"]),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "VARIABLE_HOURS"]).default("FULL_TIME"),
  daysWorkedPerWeek: z.number().min(0).max(7).default(5),
  fteRatio: z.number().min(0).max(1).default(1),
  rightToWorkVerified: z.boolean().nullable().optional(),
  department: z.string().max(100).optional(),
  countryCode: z.string().min(2, "Country is required").max(2),
});

export type TeamMemberInput = z.infer<typeof teamMemberSchema>;

export const leaveTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  isPaid: z.boolean(),
  defaultDays: z.number().int().min(1, "Must be at least 1 day"),
});

export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;
