-- SPLIT days on shared parental leave were recorded in "kitDaysUsed" by the
-- Reports parental tracker. Move them to "splitDaysUsed", where they belong,
-- for requests that don't already have SPLIT days recorded.
UPDATE "LeaveRequest" lr
SET "splitDaysUsed" = lr."kitDaysUsed",
    "kitDaysUsed" = 0
FROM "LeaveType" lt
WHERE lr."leaveTypeId" = lt."id"
  AND (lt."name" ILIKE '%shared parental%' OR lt."name" ~ '\mSPL\M')
  AND lr."kitDaysUsed" > 0
  AND lr."splitDaysUsed" = 0;
