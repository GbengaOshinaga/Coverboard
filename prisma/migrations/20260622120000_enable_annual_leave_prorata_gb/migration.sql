-- Enable pro-rata entitlement for existing UK organisations' Annual Leave.
--
-- `applyProRata` drives the UK pro-rata (part-time) and 12.07% irregular-hours
-- accrual paths in leave-balances. It is set at creation for new GB orgs via
-- enableUkStatutoryLeaveTypes, but existing orgs were left at the column
-- default (false), leaving the entitlement logic dormant.
--
-- Scoped to GB leave types only (countryCode = 'GB') so the UK 28-day pro-rata
-- maths is never applied to non-UK organisations' Annual Leave. (The original
-- 20260417180000 backfill was un-scoped; this corrects that.)
UPDATE "LeaveType"
SET "applyProRata" = true
WHERE "name" = 'Annual Leave' AND "countryCode" = 'GB';
