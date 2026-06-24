-- Expected week of childbirth (due date) for maternity leave requests.
-- Drives the SMP 26-week continuous-service eligibility test (the qualifying
-- week is 15 weeks before this date). Nullable — only set on maternity bookings.
ALTER TABLE "LeaveRequest" ADD COLUMN "expectedDueDate" DATE;
