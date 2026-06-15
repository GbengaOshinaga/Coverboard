import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSarExport, sarExportFilename, type SarPrisma } from "./sar-export";

const ORG = "org_1";
const USER = "user_1";
const NOW = new Date("2026-05-11T12:00:00Z");

type FakeData = {
  user?: Record<string, unknown> | null;
  leaveRequests?: unknown[];
  reviewedLeaves?: unknown[];
  coverOverrides?: unknown[];
  jiraMapping?: unknown;
  resetTokens?: unknown[];
  weeklyHours?: unknown[];
  carryOverBalances?: unknown[];
  weeklyEarnings?: unknown[];
  regionHistory?: unknown[];
  regionChangesMade?: unknown[];
  auditEntries?: unknown[];
};

function fakeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USER,
    email: "alice@example.com",
    name: "Alice Example",
    role: "MEMBER",
    memberType: "EMPLOYEE",
    employmentType: "FULL_TIME",
    daysWorkedPerWeek: 5,
    fteRatio: 1,
    qualifyingDaysPerWeek: 5,
    averageWeeklyEarnings: null,
    bradfordScore: 0,
    countryCode: "GB",
    workCountry: "GB",
    isActive: true,
    rightToWorkVerified: true,
    department: "Engineering",
    serviceStartDate: new Date("2025-01-15T00:00:00Z"),
    ukParentalLeaveChildCount: 0,
    digestOptOut: false,
    organizationId: ORG,
    regionId: null,
    passwordHash: "$2a$10$THIS_SHOULD_NEVER_LEAK",
    createdAt: new Date("2025-01-10T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function makePrisma(data: FakeData): {
  prisma: SarPrisma;
  capturedAuditWhere: { current: object | null };
} {
  const captured: { current: object | null } = { current: null };
  const prisma: SarPrisma = {
    user: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async findFirst(args) {
        if (
          data.user &&
          (data.user.id as string) === args.where.id &&
          (data.user.organizationId as string) === args.where.organizationId
        ) {
          return data.user as never;
        }
        return null;
      },
    },
    leaveRequest: {
      async findMany(args) {
        const w = args.where as Record<string, unknown>;
        if (w.userId) return (data.leaveRequests ?? []) as never;
        if (w.reviewedById) return (data.reviewedLeaves ?? []) as never;
        if (w.coverOverrideById) return (data.coverOverrides ?? []) as never;
        return [] as never;
      },
    },
    jiraUserMapping: {
      async findUnique() {
        return (data.jiraMapping ?? null) as never;
      },
    },
    passwordResetToken: {
      async findMany() {
        return (data.resetTokens ?? []) as never;
      },
    },
    userWeeklyHours: {
      async findMany() {
        return (data.weeklyHours ?? []) as never;
      },
    },
    leaveCarryOverBalance: {
      async findMany() {
        return (data.carryOverBalances ?? []) as never;
      },
    },
    weeklyEarning: {
      async findMany() {
        return (data.weeklyEarnings ?? []) as never;
      },
    },
    userRegionHistory: {
      async findMany(args) {
        const w = args.where as Record<string, unknown>;
        if (w.userId) return (data.regionHistory ?? []) as never;
        if (w.changedById) return (data.regionChangesMade ?? []) as never;
        return [] as never;
      },
    },
    auditLog: {
      async findMany(args) {
        captured.current = args.where;
        return (data.auditEntries ?? []) as never;
      },
    },
  };
  return { prisma, capturedAuditWhere: captured };
}

test("returns null when user does not exist in the org", async () => {
  const { prisma } = makePrisma({ user: null });
  const out = await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
  });
  assert.equal(out, null);
});

test("returns null when user is in a different org (cross-org isolation)", async () => {
  const { prisma } = makePrisma({
    user: fakeUser({ organizationId: "other_org" }),
  });
  const out = await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
  });
  assert.equal(out, null);
});

test("passwordHash is redacted from the subject section", async () => {
  const { prisma } = makePrisma({ user: fakeUser() });
  const out = await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
  });
  assert.ok(out);
  const serialized = JSON.stringify(out);
  assert.equal(
    serialized.includes("$2a$10$THIS_SHOULD_NEVER_LEAK"),
    false,
    "password hash must never appear in the export"
  );
  assert.equal(
    (out!.subject as unknown as { passwordHash?: string }).passwordHash,
    undefined
  );
});

test("password reset tokens have their token string excluded and a note added", async () => {
  const { prisma } = makePrisma({
    user: fakeUser(),
    resetTokens: [
      {
        id: "tok_1",
        token: "secret-reset-token-string-do-not-leak",
        expiresAt: new Date("2026-05-12T00:00:00Z"),
        usedAt: null,
        createdAt: new Date("2026-05-11T00:00:00Z"),
      },
    ],
  });
  const out = await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
  });
  assert.ok(out);
  assert.equal(out!.passwordResetTokens.length, 1);
  const token = out!.passwordResetTokens[0]!;
  assert.equal(
    JSON.stringify(token).includes("secret-reset-token-string-do-not-leak"),
    false
  );
  assert.equal(typeof token.note, "string");
  assert.equal(token.expiresAt, "2026-05-12T00:00:00.000Z");
});

test("aggregates leave requests for each role the user plays", async () => {
  const { prisma } = makePrisma({
    user: fakeUser(),
    leaveRequests: [{ id: "lr_1" }, { id: "lr_2" }],
    reviewedLeaves: [{ id: "lr_3" }],
    coverOverrides: [{ id: "lr_4" }],
  });
  const out = await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
  });
  assert.ok(out);
  assert.equal(out!.leaveRequests.length, 2);
  assert.equal(out!.leavesReviewedByThisUser.length, 1);
  assert.equal(out!.leavesCoverOverriddenByThisUser.length, 1);
});

test("audit log query is scoped to the org and to entries about/by this user", async () => {
  const { prisma, capturedAuditWhere } = makePrisma({
    user: fakeUser(),
  });
  await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
  });
  const where = capturedAuditWhere.current as {
    organizationId: string;
    OR: Array<Record<string, unknown>>;
  };
  assert.equal(where.organizationId, ORG);
  assert.ok(Array.isArray(where.OR));
  assert.deepEqual(where.OR[0], { actorId: USER });
  assert.deepEqual(where.OR[1], {
    AND: [{ resource: "team_member" }, { resourceId: USER }],
  });
});

test("region history is split into 'as subject' and 'as actor'", async () => {
  const { prisma } = makePrisma({
    user: fakeUser(),
    regionHistory: [{ id: "rh_1" }],
    regionChangesMade: [{ id: "rh_2" }, { id: "rh_3" }],
  });
  const out = await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
  });
  assert.ok(out);
  assert.equal(out!.regionHistoryAsSubject.length, 1);
  assert.equal(out!.regionChangesMadeByThisUser.length, 2);
});

test("envelope includes exportedAt, version, and exportedBy", async () => {
  const { prisma } = makePrisma({ user: fakeUser() });
  const out = await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
    requestedBy: { email: "admin@example.com", userId: "admin_1" },
  });
  assert.ok(out);
  assert.equal(out!.exportedAt, "2026-05-11T12:00:00.000Z");
  assert.equal(out!.exportVersion, "1.0");
  assert.deepEqual(out!.exportedBy, {
    email: "admin@example.com",
    userId: "admin_1",
  });
});

test("dates are serialised as ISO strings for the subject", async () => {
  const { prisma } = makePrisma({ user: fakeUser() });
  const out = await buildSarExport({
    prisma,
    organizationId: ORG,
    userId: USER,
    now: NOW,
  });
  assert.ok(out);
  assert.equal(typeof out!.subject.createdAt, "string");
  assert.equal(out!.subject.createdAt, "2025-01-10T00:00:00.000Z");
  assert.equal(out!.subject.serviceStartDate, "2025-01-15T00:00:00.000Z");
});

test("sarExportFilename sanitises the email and stamps the date", () => {
  const name = sarExportFilename(
    { email: "alice+gdpr@example.com", id: "u1" },
    new Date("2026-05-11T08:00:00Z")
  );
  assert.match(name, /^sar-export-alice_gdpr_example.com-2026-05-11\.json$/);
});
