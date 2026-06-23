-- Hours-native booking for irregular/zero-hours workers (Phase 2).
--
-- Records the hours a leave request deducts from an hours-based holiday balance.
-- NULL means day-based (every existing row and all non-hours leave), which the
-- balance maths still counts via countWeekdays() — so no backfill is required.
ALTER TABLE "LeaveRequest" ADD COLUMN "hoursBooked" DOUBLE PRECISION;
