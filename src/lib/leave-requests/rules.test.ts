import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarDaysUntil,
  checkEndDateChange,
  checkOnBehalf,
  isSicknessLeaveTypeName,
  noticeError,
  rescaleHours,
} from "./rules";

const AT_0710 = new Date("2026-09-30T07:10:00Z");

test("calendarDaysUntil: same-day request is 0, not -1", () => {
  assert.equal(calendarDaysUntil(new Date("2026-09-30"), AT_0710), 0);
});

test("calendarDaysUntil: counts whole calendar days either side", () => {
  assert.equal(calendarDaysUntil(new Date("2026-10-01"), AT_0710), 1);
  assert.equal(calendarDaysUntil(new Date("2026-10-14"), AT_0710), 14);
  assert.equal(calendarDaysUntil(new Date("2026-09-29"), AT_0710), -1);
});

test("noticeError: a 0-day notice type accepts a same-day start", () => {
  const holiday = { name: "Annual Leave", minNoticeDays: 0 };
  assert.equal(noticeError(holiday, new Date("2026-09-30"), AT_0710), null);
});

test("noticeError: enforces notice for planned leave", () => {
  const holiday = { name: "Annual Leave", minNoticeDays: 14 };
  assert.equal(noticeError(holiday, new Date("2026-10-14"), AT_0710), null);
  assert.match(
    noticeError(holiday, new Date("2026-10-13"), AT_0710) ?? "",
    /at least 14 days notice/
  );
});

test("noticeError: sickness is never subject to notice, even backdated", () => {
  const ssp = { name: "Statutory Sick Pay (SSP)", minNoticeDays: 3 };
  assert.equal(noticeError(ssp, new Date("2026-09-28"), AT_0710), null);
  const sick = { name: "Sick Leave", minNoticeDays: 0 };
  assert.equal(noticeError(sick, new Date("2026-09-29"), AT_0710), null);
});

test("isSicknessLeaveTypeName matches SSP and sick leave only", () => {
  assert.equal(isSicknessLeaveTypeName("Statutory Sick Pay (SSP)"), true);
  assert.equal(isSicknessLeaveTypeName("Sick Leave"), true);
  assert.equal(isSicknessLeaveTypeName("Annual Leave"), false);
  assert.equal(isSicknessLeaveTypeName("Compassionate Leave"), false);
});

test("checkOnBehalf: managers and admins may log sickness for a colleague", () => {
  for (const role of ["ADMIN", "MANAGER"]) {
    assert.deepEqual(
      checkOnBehalf({
        actorRole: role,
        subjectFound: true,
        leaveTypeName: "Statutory Sick Pay (SSP)",
      }),
      { ok: true }
    );
  }
});

test("checkOnBehalf: members are forbidden", () => {
  const r = checkOnBehalf({
    actorRole: "MEMBER",
    subjectFound: true,
    leaveTypeName: "Sick Leave",
  });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 403);
});

test("checkOnBehalf: subject outside the org is not found", () => {
  const r = checkOnBehalf({
    actorRole: "MANAGER",
    subjectFound: false,
    leaveTypeName: "Sick Leave",
  });
  assert.equal(!r.ok && r.status, 404);
});

test("checkOnBehalf: planned leave cannot be booked on someone's behalf", () => {
  const r = checkOnBehalf({
    actorRole: "ADMIN",
    subjectFound: true,
    leaveTypeName: "Annual Leave",
  });
  assert.equal(!r.ok && r.status, 400);
});

const SICK_CHANGE = {
  actorRole: "MANAGER",
  leaveTypeName: "Statutory Sick Pay (SSP)",
  status: "APPROVED",
  startDate: new Date("2026-09-30"),
  oldEndDate: new Date("2026-09-30"),
  newEndDate: new Date("2026-10-02"),
};

test("checkEndDateChange: a manager can extend or shorten sickness", () => {
  assert.deepEqual(checkEndDateChange(SICK_CHANGE), { ok: true });
  assert.deepEqual(
    checkEndDateChange({
      ...SICK_CHANGE,
      oldEndDate: new Date("2026-10-05"),
      newEndDate: new Date("2026-10-01"),
    }),
    { ok: true }
  );
  assert.deepEqual(checkEndDateChange({ ...SICK_CHANGE, status: "PENDING" }), { ok: true });
});

test("checkEndDateChange: members can't change dates", () => {
  const r = checkEndDateChange({ ...SICK_CHANGE, actorRole: "MEMBER" });
  assert.equal(!r.ok && r.status, 403);
});

test("checkEndDateChange: only sickness, only live absences", () => {
  const holiday = checkEndDateChange({ ...SICK_CHANGE, leaveTypeName: "Annual Leave" });
  assert.equal(!holiday.ok && holiday.status, 400);
  const cancelled = checkEndDateChange({ ...SICK_CHANGE, status: "CANCELLED" });
  assert.match(!cancelled.ok ? cancelled.error : "", /cancelled/);
});

test("checkEndDateChange: end can't precede start or be unchanged", () => {
  const before = checkEndDateChange({ ...SICK_CHANGE, newEndDate: new Date("2026-09-29") });
  assert.equal(before.ok, false);
  const same = checkEndDateChange({ ...SICK_CHANGE, newEndDate: SICK_CHANGE.oldEndDate });
  assert.equal(same.ok, false);
});

test("rescaleHours keeps hours per day; null stays null", () => {
  assert.equal(rescaleHours(15, 2, 5), 37.5);
  assert.equal(rescaleHours(null, 2, 5), null);
  assert.equal(rescaleHours(8, 0, 3), 8);
});
