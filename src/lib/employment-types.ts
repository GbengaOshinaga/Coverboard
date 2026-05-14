export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "VARIABLE_HOURS",
  "ZERO_HOURS",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  VARIABLE_HOURS: "Variable hours",
  ZERO_HOURS: "Zero-hours contract",
};

export const EMPLOYMENT_TYPE_OPTIONS = EMPLOYMENT_TYPES.map((value) => ({
  value,
  label: EMPLOYMENT_TYPE_LABELS[value],
}));

export function isEmploymentType(value: unknown): value is EmploymentType {
  return (
    typeof value === "string" &&
    (EMPLOYMENT_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeEmploymentType(
  value: unknown
): EmploymentType | unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  const zeroHoursKey = trimmed.toLowerCase().replace(/[\s_-]+/g, "");
  if (zeroHoursKey === "zerohours") return "ZERO_HOURS";

  const normalized = trimmed.toUpperCase().replace(/[\s-]+/g, "_");
  if (isEmploymentType(normalized)) return normalized;
  return value;
}

export function formatEmploymentType(value: string | null | undefined): string {
  return isEmploymentType(value) ? EMPLOYMENT_TYPE_LABELS[value] : value ?? "—";
}

export function isHoursAveragedEmploymentType(
  value: string | null | undefined
): boolean {
  return value === "VARIABLE_HOURS" || value === "ZERO_HOURS";
}
