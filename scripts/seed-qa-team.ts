import "./qa-env";
import bcrypt from "bcryptjs";
import type { EmploymentType, MemberType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enableUkStatutoryLeaveTypes } from "@/lib/uk-statutory";
import { baseLeaveTypesFor } from "@/lib/country-policies";
import { createLeaveRequest } from "@/lib/leave-requests/create";
import { reviewLeaveRequest } from "@/lib/leave-requests/review";
import { recordLeaving } from "@/lib/leavers";
import { syncUserAverageWeeklyEarnings } from "@/lib/smpCalculator";
import { unusablePasswordHash } from "@/lib/invite-links";

/**
 * A QA team for trying every feature locally: "Coverboard QA Care", a UK care
 * provider on Pro with day and night units, shifts, and someone in each
 * situation the rules treat differently (part-time, zero hours, new starter,
 * maternity, paternity, off sick with a fit note, a parent with unpaid
 * parental leave, night worker with a 48-hour opt-out, leavers, a contractor,
 * an invite not yet accepted, right-to-work checks due).
 *
 * Leave is booked through the app's own code (createLeaveRequest and
 * reviewLeaveRequest), so SSP, SMP, paternity pay and holiday pay are worked
 * out as they would be in use. Emails, Slack, analytics and Stripe are off
 * for the run (scripts/qa-env.ts). Dates are relative to today, so re-running
 * later gives a team in the same state.
 *
 * Local databases only. Re-running deletes this team and makes it again; no
 * other team is touched. Logins: <name>@coverboard-qa.test with the seed
 * password (prisma/seed.ts).
 *
 *   npm run seed:qa
 */

const SLUG = "coverboard-qa-care";
const DOMAIN = "coverboard-qa.test";
const DAY_MS = 86_400_000;

const todayUtc = (() => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
})();
/** UTC midnight, `offset` days from today. */
const day = (offset: number) => new Date(todayUtc.getTime() + offset * DAY_MS);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** The Monday on or after a date. */
const mondayFrom = (d: Date) => new Date(d.getTime() + ((8 - d.getUTCDay()) % 7) * DAY_MS);
/** The next weekday after a date. */
const nextWeekday = (d: Date) => {
  let t = new Date(d.getTime() + DAY_MS);
  while (t.getUTCDay() === 0 || t.getUTCDay() === 6) t = new Date(t.getTime() + DAY_MS);
  return t;
};
/** The first date on or after `d` that falls on `weekday` (Monday = 0). */
const onWeekday = (d: Date, weekday: number) => new Date(d.getTime() + ((weekday - ((d.getUTCDay() + 6) % 7) + 7) % 7) * DAY_MS);
const endOfDay = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/?]+)/)?.[1] ?? "";
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refusing to run: DATABASE_URL isn't a local database (host "${host || "none"}").`);
  }
}

type Person = {
  key: string;
  name: string;
  role: Role;
  memberType?: MemberType;
  employmentType?: EmploymentType;
  daysWorkedPerWeek?: number;
  fteRatio?: number;
  department: string;
  started: string;
  unit?: "day" | "night";
  /** Shift and weekdays (Monday = 0) of their working pattern. */
  pattern?: { shift: "Early" | "Late" | "Night"; weekdays: number[] }[];
  /** Weekly pay, for the earnings history; omitted for contractors. */
  weeklyPay?: number;
  workingTimeOptOut?: boolean;
  invited?: boolean;
};

const PEOPLE: Person[] = [
  { key: "alex", name: "Alex Morgan", role: "ADMIN", department: "Operations", started: "2020-03-02", weeklyPay: 780 },
  { key: "priya", name: "Priya Shah", role: "ADMIN", department: "Finance", started: "2022-06-13", weeklyPay: 720 },
  {
    key: "marcus", name: "Marcus Reid", role: "MANAGER", department: "Day unit", started: "2021-01-11", unit: "day",
    pattern: [{ shift: "Early", weekdays: [0, 1, 2, 3, 4] }], weeklyPay: 640,
  },
  {
    key: "grace", name: "Grace Okafor", role: "MANAGER", department: "Night unit", started: "2021-09-06", unit: "night",
    pattern: [{ shift: "Night", weekdays: [0, 1, 2, 3] }], daysWorkedPerWeek: 4, weeklyPay: 660,
  },
  {
    key: "tom", name: "Tom Bennett", role: "MEMBER", department: "Day unit", started: "2023-02-06", unit: "day",
    pattern: [{ shift: "Early", weekdays: [0, 1, 2] }, { shift: "Late", weekdays: [5, 6] }], weeklyPay: 480,
  },
  {
    key: "hannah", name: "Hannah Lewis", role: "MEMBER", department: "Day unit", started: "2022-04-04", unit: "day",
    employmentType: "PART_TIME", daysWorkedPerWeek: 4, fteRatio: 0.8,
    pattern: [{ shift: "Late", weekdays: [0, 1, 2, 3] }], weeklyPay: 384,
  },
  {
    key: "jordan", name: "Jordan Price", role: "MEMBER", department: "Bank staff", started: "2024-05-20",
    employmentType: "ZERO_HOURS", weeklyPay: 0,
  },
  {
    key: "sam", name: "Sam Carter", role: "MEMBER", department: "Day unit", started: ymd(day(-40)), unit: "day",
    pattern: [{ shift: "Late", weekdays: [2, 3, 4] }, { shift: "Early", weekdays: [5, 6] }], weeklyPay: 480,
  },
  {
    key: "ellie", name: "Ellie Ward", role: "MEMBER", department: "Day unit", started: "2021-08-02", unit: "day",
    pattern: [{ shift: "Early", weekdays: [0, 1, 2, 3, 4] }], weeklyPay: 520,
  },
  {
    key: "dan", name: "Daniel Hughes", role: "MEMBER", department: "Day unit", started: "2019-11-04", unit: "day",
    pattern: [{ shift: "Early", weekdays: [0, 1, 2, 3, 4] }], weeklyPay: 495,
  },
  {
    key: "ravi", name: "Ravi Kumar", role: "MEMBER", department: "Night unit", started: "2020-10-05", unit: "night",
    pattern: [{ shift: "Night", weekdays: [0, 1, 2, 3, 4] }], weeklyPay: 540,
  },
  {
    key: "leah", name: "Leah Fox", role: "MEMBER", department: "Night unit", started: "2023-07-03", unit: "night",
    pattern: [{ shift: "Night", weekdays: [3, 4, 5, 6] }], daysWorkedPerWeek: 4, weeklyPay: 560, workingTimeOptOut: true,
  },
  { key: "olu", name: "Olu Adeyemi", role: "MEMBER", department: "Day unit", started: "2022-01-10", weeklyPay: 470 },
  {
    key: "chris", name: "Chris Dale", role: "MEMBER", department: "Night unit", started: "2021-05-17", unit: "night",
    pattern: [{ shift: "Night", weekdays: [4, 5, 6] }], daysWorkedPerWeek: 3, fteRatio: 0.6, employmentType: "PART_TIME",
    weeklyPay: 330,
  },
  { key: "nina", name: "Nina Rossi", role: "MEMBER", memberType: "CONTRACTOR", department: "Physiotherapy", started: "2025-02-03" },
  { key: "kim", name: "Kim Taylor", role: "MEMBER", department: "Day unit", started: ymd(day(14)), invited: true },
];

async function removeExistingTeam() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  // Leave requests first: they hold a required link to the team's leave types.
  await prisma.leaveRequest.deleteMany({ where: { user: { organizationId: org.id } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
  await prisma.dataDeletionAudit.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

async function main() {
  assertLocalDatabase();
  await removeExistingTeam();
  // Any QA logins left from a team that was renamed or half made.
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });

  const org = await prisma.organization.create({
    data: {
      name: "Coverboard QA Care",
      slug: SLUG,
      onboardingCompleted: true,
      plan: "PRO",
      subscriptionStatus: "active",
      cardAdded: true,
      paidPlanStartedAt: day(-200),
      industry: "Care",
      regionsEnabled: true,
      ukCarryOverEnabled: true,
      ukCarryOverMax: 5,
      maxAdminUsers: 3,
    },
  });

  // Leave types, policies and bank holidays as onboarding makes them for a UK team.
  for (const lt of baseLeaveTypesFor(["GB"])) {
    await prisma.leaveType.create({
      data: {
        name: lt.name,
        color: lt.color,
        isPaid: lt.isPaid,
        defaultDays: lt.defaultDays,
        category: lt.isPaid ? "PAID" : "UNPAID",
        organizationId: org.id,
      },
    });
  }
  await enableUkStatutoryLeaveTypes(org.id);
  const leaveTypes = await prisma.leaveType.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } });
  const typeId = (name: string) => {
    const t = leaveTypes.find((l) => l.name === name);
    if (!t) throw new Error(`No leave type "${name}"`);
    return t.id;
  };

  // Units and shifts: cover is checked per shift.
  const allWeek = (n: number) => [n, n, n, n, n, n, n];
  const dayUnit = await prisma.region.create({
    data: { organizationId: org.id, name: "Day unit", description: "Residential care, days", minCover: 2, color: "#3b82f6" },
  });
  const nightUnit = await prisma.region.create({
    data: { organizationId: org.id, name: "Night unit", description: "Residential care, nights", minCover: 1, color: "#6366f1" },
  });
  const shifts = {
    Early: await prisma.shiftType.create({
      data: { regionId: dayUnit.id, name: "Early", startTime: "07:00", endTime: "15:00", minCoverByWeekday: allWeek(2), sortOrder: 0 },
    }),
    Late: await prisma.shiftType.create({
      data: { regionId: dayUnit.id, name: "Late", startTime: "14:00", endTime: "22:00", minCoverByWeekday: allWeek(2), sortOrder: 1 },
    }),
    Night: await prisma.shiftType.create({
      data: { regionId: nightUnit.id, name: "Night", startTime: "21:30", endTime: "07:30", minCoverByWeekday: allWeek(1), sortOrder: 0 },
    }),
  };

  // People.
  const passwordHash = await bcrypt.hash("password123", 10); // the seed password (prisma/seed.ts)
  const ids: Record<string, string> = {};
  for (const p of PEOPLE) {
    const days = p.pattern ? p.pattern.reduce((n, s) => n + s.weekdays.length, 0) : (p.daysWorkedPerWeek ?? 5);
    const user = await prisma.user.create({
      data: {
        email: `${p.key}@${DOMAIN}`,
        name: p.name,
        passwordHash: p.invited ? await unusablePasswordHash() : passwordHash,
        emailVerified: p.invited ? null : day(-30),
        role: p.role,
        memberType: p.memberType ?? "EMPLOYEE",
        employmentType: p.employmentType ?? "FULL_TIME",
        daysWorkedPerWeek: p.employmentType === "ZERO_HOURS" ? 5 : days,
        qualifyingDaysPerWeek: p.employmentType === "ZERO_HOURS" ? 5 : Math.round(days),
        fteRatio: p.fteRatio ?? (days >= 5 ? 1 : days / 5),
        countryCode: "GB",
        workCountry: "GB",
        department: p.department,
        serviceStartDate: new Date(`${p.started}T00:00:00Z`),
        regionId: p.unit === "day" ? dayUnit.id : p.unit === "night" ? nightUnit.id : null,
        workingTimeOptOutFrom: p.workingTimeOptOut ? new Date("2023-07-03T00:00:00Z") : null,
        organizationId: org.id,
      },
    });
    ids[p.key] = user.id;
    if (p.pattern) {
      for (const s of p.pattern) {
        for (const weekday of s.weekdays) {
          await prisma.workPattern.create({
            data: { userId: user.id, shiftTypeId: shifts[s.shift].id, weekday, effectiveFrom: new Date(`${p.started}T00:00:00Z`) },
          });
        }
      }
    }
  }
  const actor = (key: string) => {
    const p = PEOPLE.find((x) => x.key === key)!;
    return { id: ids[key], email: `${key}@${DOMAIN}`, name: p.name, role: p.role, plan: "PRO" };
  };

  // Right to work: checked with no time limit for most; Sam's visa needs a
  // recheck soon, Jordan has no check recorded, the contractor isn't checked.
  for (const p of PEOPLE) {
    if (p.memberType === "CONTRACTOR" || p.invited || p.key === "jordan") continue;
    const timeLimited = p.key === "sam";
    const checkedOn = new Date(`${p.started}T00:00:00Z`);
    const expiresOn = timeLimited ? day(45) : null;
    await prisma.rightToWorkCheck.create({
      data: {
        userId: ids[p.key],
        checkedOn,
        method: timeLimited ? "ONLINE_SHARE_CODE" : "MANUAL_DOCUMENTS",
        documentType: timeLimited ? "Share code result" : "UK passport",
        hasRightToWork: true,
        expiresOn,
        checkedById: ids.alex,
      },
    });
    await prisma.user.update({
      where: { id: ids[p.key] },
      data: { rightToWorkVerified: true, rightToWorkCheckedOn: checkedOn, rightToWorkExpiresOn: expiresOn },
    });
  }

  // Earnings, Mondays over the last 60 weeks, for SSP, SMP and holiday pay.
  // Jordan's vary week to week with the hours logged.
  const jordanHours = [0, 12, 24, 30, 16, 0, 36, 20, 8, 28];
  const ellieLeaveStart = mondayFrom(day(-35));
  const firstMonday = mondayFrom(day(-60 * 7));
  for (const p of PEOPLE) {
    if (p.weeklyPay === undefined) continue;
    const started = new Date(`${p.started}T00:00:00Z`);
    const stop = p.key === "ellie" ? ellieLeaveStart : p.key === "olu" ? new Date("2026-09-28T00:00:00Z") : todayUtc;
    let i = 0;
    for (let w = firstMonday; w < stop; w = new Date(w.getTime() + 7 * DAY_MS), i++) {
      if (w < started) continue;
      const hours = p.key === "jordan" ? jordanHours[i % jordanHours.length] : (p.weeklyPay / 12.8);
      const gross = p.key === "jordan" ? hours * 12.6 : p.weeklyPay;
      await prisma.weeklyEarning.create({
        data: {
          userId: ids[p.key],
          weekStartDate: w,
          grossEarnings: gross.toFixed(2),
          hoursWorked: hours.toFixed(2),
          isZeroPayWeek: gross === 0,
        },
      });
      if (p.key === "jordan") {
        await prisma.userWeeklyHours.create({ data: { userId: ids.jordan, weekStartDate: w, hoursWorked: hours } });
      }
    }
    await syncUserAverageWeeklyEarnings(ids[p.key], p.key === "ellie" ? ellieLeaveStart : todayUtc);
  }

  // Children: Ravi's new baby (paternity) and an older child (unpaid parental leave).
  const babyBorn = day(-40);
  await prisma.child.create({ data: { userId: ids.ravi, label: "Maya", dateOfBirth: babyBorn } });
  const olderChild = await prisma.child.create({
    data: { userId: ids.ravi, label: "Arjun", dateOfBirth: new Date("2019-05-14T00:00:00Z") },
  });
  await prisma.user.update({ where: { id: ids.ravi }, data: { ukParentalLeaveChildCount: 2 } });

  // Carry-over into this leave year: Tom's company carry-over has expired
  // (31 March), Dan's from long-term sickness lasts 18 months.
  const year = todayUtc.getUTCFullYear();
  await prisma.leaveCarryOverBalance.create({
    data: {
      userId: ids.tom, leaveTypeId: typeId("Annual Leave"), leaveYear: year, reason: "COMPANY_POLICY",
      daysCarried: 3, daysRemaining: 3, expiresAt: endOfDay(`${year}-03-31`),
    },
  });
  await prisma.leaveCarryOverBalance.create({
    data: {
      userId: ids.dan, leaveTypeId: typeId("Annual Leave"), leaveYear: year, reason: "SICKNESS",
      daysCarried: 6, daysRemaining: 6, expiresAt: endOfDay(`${year + 1}-06-30`),
    },
  });

  // Leave, booked as the app books it. A manager or admin recording leave for
  // someone is approved at once; people's own requests wait for approval.
  const failures: string[] = [];
  async function book(
    label: string,
    by: string,
    forKey: string | null,
    type: string,
    start: Date,
    end: Date,
    extra: Partial<Parameters<typeof createLeaveRequest>[0]> = {}
  ): Promise<string | null> {
    const result = await createLeaveRequest({
      actor: actor(by),
      organizationId: org.id,
      leaveTypeId: typeId(type),
      startDate: start,
      endDate: end,
      ...(forKey && forKey !== by ? { onBehalfOfUserId: ids[forKey] } : {}),
      ...extra,
    });
    if (!result.ok) {
      failures.push(`${label}: ${result.error}`);
      return null;
    }
    return result.request.id;
  }

  const AL = "Annual Leave";
  const SICK = "Statutory Sick Pay (SSP)";

  // Holiday taken and booked.
  await book("Tom, summer holiday", "marcus", "tom", AL, new Date(`${year}-08-10T00:00:00Z`), new Date(`${year}-08-14T00:00:00Z`));
  await book("Tom, next week", "marcus", "tom", AL, nextWeekday(day(6)), nextWeekday(day(8)));
  await book("Tom, pending", "tom", null, AL, nextWeekday(day(40)), nextWeekday(day(42)));
  await book("Hannah, spring", "marcus", "hannah", AL, new Date(`${year}-04-13T00:00:00Z`), new Date(`${year}-04-16T00:00:00Z`));
  await book("Hannah, pending", "hannah", null, AL, nextWeekday(day(14)), nextWeekday(day(15)));
  await book("Jordan, hours-based", "marcus", "jordan", AL, new Date(`${year}-07-20T00:00:00Z`), new Date(`${year}-07-21T00:00:00Z`), {
    hoursBooked: 12,
  });
  // Bookings fall on days each person works (Sam Wed–Sun, Leah Thu–Sun).
  const samFrom = onWeekday(day(20), 2);
  await book("Sam, pending", "sam", null, AL, samFrom, new Date(samFrom.getTime() + DAY_MS));
  const leahFrom = onWeekday(day(18), 3);
  await book("Leah, booked", "grace", "leah", AL, leahFrom, new Date(leahFrom.getTime() + DAY_MS));
  await book("Grace, pending (needs an admin)", "grace", null, AL, nextWeekday(day(30)), nextWeekday(day(34)));
  await book("Priya, pending (other admin approves)", "priya", null, AL, nextWeekday(day(25)), nextWeekday(day(26)));
  await book("Alex, booked", "priya", "alex", AL, nextWeekday(day(55)), nextWeekday(day(59)));
  await book("Olu, holiday before leaving", "marcus", "olu", AL, new Date(`${year}-06-01T00:00:00Z`), new Date(`${year}-06-05T00:00:00Z`));
  await book("Chris, booked after his last day", "grace", "chris", AL, day(60), day(62));

  // Sickness: Dan off now with a fit note, and earlier short spells (Bradford).
  await book("Dan, March", "marcus", "dan", SICK, new Date(`${year}-03-09T00:00:00Z`), new Date(`${year}-03-10T00:00:00Z`), {
    sicknessNote: "Migraine",
  });
  await book("Dan, June", "marcus", "dan", SICK, new Date(`${year}-06-15T00:00:00Z`), new Date(`${year}-06-17T00:00:00Z`), {
    sicknessNote: "Stomach bug",
  });
  const danNow = await book("Dan, off now", "marcus", "dan", SICK, day(-10), day(4), { sicknessNote: "Back injury" });
  if (danNow) {
    await prisma.fitNote.create({
      data: { leaveRequestId: danNow, coversFrom: day(-3), coversTo: day(4), receivedOn: day(-2), recordedById: ids.marcus },
    });
    await prisma.leaveRequest.update({ where: { id: danNow }, data: { evidenceProvided: true } });
    // Short on the Early shift while he's off: Tom has been asked to cover.
    await prisma.coverOffer.create({
      data: {
        organizationId: org.id, shiftTypeId: shifts.Early.id, date: nextWeekday(todayUtc), userId: ids.tom,
        offeredById: ids.marcus, leaveRequestId: danNow,
      },
    });
  }
  await book("Marcus, self-certified", "alex", "marcus", SICK, new Date(`${year}-09-21T00:00:00Z`), new Date(`${year}-09-22T00:00:00Z`), {
    sicknessNote: "Cold",
  });

  // Family leave: Ellie on maternity, Ravi back from paternity, Ravi's unpaid parental leave pending.
  await book("Ellie, maternity", "alex", "ellie", "Statutory Maternity Leave", ellieLeaveStart, new Date(ellieLeaveStart.getTime() + (52 * 7 - 1) * DAY_MS), {
    expectedDueDate: new Date(ellieLeaveStart.getTime() + 13 * DAY_MS),
    evidenceProvided: true,
  });
  const patStart = mondayFrom(new Date(babyBorn.getTime() + DAY_MS));
  await book("Ravi, paternity", "grace", "ravi", "Statutory Paternity Leave", patStart, new Date(patStart.getTime() + 13 * DAY_MS), {
    expectedDueDate: new Date(babyBorn.getTime() - 2 * DAY_MS),
    childBirthDate: babyBorn,
    evidenceProvided: true,
  });
  const uplStart = mondayFrom(day(30));
  await book("Ravi, unpaid parental leave", "ravi", null, "Unpaid Parental Leave", uplStart, new Date(uplStart.getTime() + 6 * DAY_MS), {
    childId: olderChild.id,
  });

  // An approved and a rejected request, decided the way managers do.
  const toApprove = await book("Hannah, to approve", "hannah", null, AL, nextWeekday(day(70)), nextWeekday(day(70)));
  if (toApprove) {
    await reviewLeaveRequest({ requestId: toApprove, decision: "APPROVED", reviewer: actor("marcus"), organizationId: org.id });
  }
  const rejectFrom = onWeekday(day(35), 3);
  const toReject = await book("Leah, to reject", "leah", null, AL, rejectFrom, new Date(rejectFrom.getTime() + DAY_MS));
  if (toReject) {
    await reviewLeaveRequest({ requestId: toReject, decision: "REJECTED", reviewer: actor("grace"), organizationId: org.id });
  }

  // Leavers: Olu left at the end of September; Chris is working his notice.
  for (const [key, lastDay] of [["olu", `${year}-09-30`], ["chris", ymd(day(49))]] as const) {
    const r = await recordLeaving({ userId: ids[key], organizationId: org.id, lastDay, today: ymd(todayUtc) });
    if ("error" in r && r.error) failures.push(`${key} leaving: ${r.error}`);
  }

  const [people, requests] = await Promise.all([
    prisma.user.count({ where: { organizationId: org.id } }),
    prisma.leaveRequest.groupBy({ by: ["status"], where: { user: { organizationId: org.id } }, _count: true }),
  ]);
  console.log(`Made "${org.name}" (Pro, UK) with ${people} people.`);
  console.log(`Leave: ${requests.map((r) => `${r._count} ${r.status.toLowerCase()}`).join(", ")}.`);
  console.log("");
  console.log("Logins (seed password):");
  for (const p of PEOPLE) {
    const note = p.invited ? " (invite not accepted: can't sign in)" : p.key === "olu" ? " (left: can't sign in)" : "";
    console.log(`  ${`${p.key}@${DOMAIN}`.padEnd(30)} ${p.role.padEnd(8)} ${p.name}${note}`);
  }
  if (failures.length > 0) {
    console.log("");
    console.log("Not booked:");
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
