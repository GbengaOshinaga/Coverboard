import { isHoursAveragedEmploymentType } from "@/lib/employment-types";
import { FTE_STANDARD_HOURS_PER_WEEK, calculateVariableHoursFte } from "@/lib/uk-compliance";

/**
 * Someone's full-time equivalent, from one place. Irregular and zero-hours
 * staff have no contracted FTE: theirs is the average of their logged weekly
 * hours over the last 52 weeks ÷ the team's full-time hours. Everyone else's
 * is the contracted FTE entered on their profile.
 */
export type Fte = {
  /** null: irregular-hours with no weeks logged yet. */
  value: number | null;
  basis: "contracted" | "logged_hours";
  /** Weeks of logged hours behind a logged_hours value. */
  weeks: number;
};

export function describeFte(input: {
  employmentType: string;
  fteRatio: number;
  /** Logged weekly hours, oldest first. */
  weeklyHours: number[];
  fullTimeHoursPerWeek?: number;
}): Fte {
  if (!isHoursAveragedEmploymentType(input.employmentType)) {
    return { value: input.fteRatio, basis: "contracted", weeks: 0 };
  }
  const recent = input.weeklyHours.slice(-52);
  if (recent.length === 0) return { value: null, basis: "logged_hours", weeks: 0 };
  return {
    value: calculateVariableHoursFte(recent, input.fullTimeHoursPerWeek ?? FTE_STANDARD_HOURS_PER_WEEK),
    basis: "logged_hours",
    weeks: recent.length,
  };
}

/** "FTE 1 (contracted)", "FTE 0.427 (12 weeks' logged hours)". */
export function fteLabel(fte: Fte): string {
  if (fte.basis === "contracted") return `FTE ${fte.value} (contracted)`;
  if (fte.value === null) return "FTE: no hours logged yet";
  return `FTE ${fte.value} (${fte.weeks} week${fte.weeks === 1 ? "" : "s"}' logged hours)`;
}
