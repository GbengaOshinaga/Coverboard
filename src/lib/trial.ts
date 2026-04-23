/**
 * Utilities for computing trial countdown state from `trialEndsAt`.
 * Pure functions — safe to use in server or test contexts.
 */

export type TrialState = {
  daysLeft: number;
  tone: "info" | "warn" | "danger" | "ended";
  endsAt: Date;
};

export function computeTrialState(
  trialEndsAt: Date | null | undefined,
  now: Date = new Date()
): TrialState | null {
  if (!trialEndsAt) return null;

  const msLeft = trialEndsAt.getTime() - now.getTime();
  // Round UP so the banner says "1 day" rather than "0 days" on the final day.
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

  let tone: TrialState["tone"];
  if (msLeft <= 0) tone = "ended";
  else if (daysLeft <= 1) tone = "danger";
  else if (daysLeft <= 3) tone = "warn";
  else tone = "info";

  return { daysLeft, tone, endsAt: trialEndsAt };
}
