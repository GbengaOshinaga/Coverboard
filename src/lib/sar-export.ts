/**
 * Subject Access Request (SAR) export.
 *
 * Gathers every record in the database that relates to a single employee and
 * returns a JSON-serializable object. UK GDPR Art. 15 requires data to be
 * provided in a "commonly used and machine-readable form" — JSON satisfies
 * that. Sensitive fields (password hash, reset-token strings) are redacted.
 */

const SAR_EXPORT_VERSION = "1.0";

export type SarPrisma = {
  user: {
    findFirst(args: {
      where: { id: string; organizationId: string };
    }): Promise<UserRow | null>;
  };
  leaveRequest: {
    findMany(args: { where: object; orderBy?: object }): Promise<LeaveRequestRow[]>;
  };
  jiraUserMapping: {
    findUnique(args: { where: { userId: string } }): Promise<JiraMappingRow | null>;
  };
  passwordResetToken: {
    findMany(args: { where: { userId: string }; orderBy?: object }): Promise<ResetTokenRow[]>;
  };
  userWeeklyHours: {
    findMany(args: { where: { userId: string }; orderBy?: object }): Promise<WeeklyHoursRow[]>;
  };
  leaveCarryOverBalance: {
    findMany(args: { where: { userId: string }; orderBy?: object }): Promise<CarryOverRow[]>;
  };
  weeklyEarning: {
    findMany(args: { where: { userId: string }; orderBy?: object }): Promise<EarningRow[]>;
  };
  userRegionHistory: {
    findMany(args: { where: object; orderBy?: object }): Promise<RegionHistoryRow[]>;
  };
  auditLog: {
    findMany(args: { where: object; orderBy?: object; take?: number }): Promise<AuditRow[]>;
  };
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  memberType: string;
  employmentType: string;
  daysWorkedPerWeek: number;
  fteRatio: number;
  qualifyingDaysPerWeek: number;
  averageWeeklyEarnings: unknown;
  bradfordScore: number;
  countryCode: string;
  workCountry: string | null;
  isActive: boolean;
  rightToWorkVerified: boolean | null;
  department: string | null;
  serviceStartDate: Date | null;
  ukParentalLeaveChildCount: number;
  digestOptOut: boolean;
  organizationId: string;
  regionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LeaveRequestRow = Record<string, unknown> & { id: string };
type JiraMappingRow = Record<string, unknown> & { id: string };
type ResetTokenRow = {
  id: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  // token field is intentionally excluded from the type — we never want it in the export
};
type WeeklyHoursRow = Record<string, unknown> & { id: string };
type CarryOverRow = Record<string, unknown> & { id: string };
type EarningRow = Record<string, unknown> & { id: string };
type RegionHistoryRow = Record<string, unknown> & { id: string };
type AuditRow = Record<string, unknown> & { id: string };

export type SarExport = {
  exportVersion: string;
  exportedAt: string;
  exportedBy: { email: string | null; userId: string | null } | null;
  subject: Omit<UserRow, "createdAt" | "updatedAt" | "serviceStartDate"> & {
    createdAt: string;
    updatedAt: string;
    serviceStartDate: string | null;
  };
  leaveRequests: LeaveRequestRow[];
  leavesReviewedByThisUser: LeaveRequestRow[];
  leavesCoverOverriddenByThisUser: LeaveRequestRow[];
  jiraMapping: JiraMappingRow | null;
  passwordResetTokens: Array<{
    id: string;
    expiresAt: string;
    usedAt: string | null;
    createdAt: string;
    note: string;
  }>;
  weeklyHours: WeeklyHoursRow[];
  carryOverBalances: CarryOverRow[];
  weeklyEarnings: EarningRow[];
  regionHistoryAsSubject: RegionHistoryRow[];
  regionChangesMadeByThisUser: RegionHistoryRow[];
  auditLogActivity: AuditRow[];
};

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export async function buildSarExport(params: {
  prisma: SarPrisma;
  organizationId: string;
  userId: string;
  requestedBy?: { email: string | null; userId: string | null };
  now?: Date;
  auditLogLimit?: number;
}): Promise<SarExport | null> {
  const { prisma, organizationId, userId } = params;
  const now = params.now ?? new Date();
  const auditLimit = params.auditLogLimit ?? 5000;

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
  });
  if (!user) return null;

  const [
    leaveRequests,
    leavesReviewed,
    leavesCoverOverridden,
    jiraMapping,
    resetTokens,
    weeklyHours,
    carryOverBalances,
    weeklyEarnings,
    regionHistory,
    regionChangesMade,
    auditEntries,
  ] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
    }),
    prisma.leaveRequest.findMany({
      where: { reviewedById: userId },
      orderBy: { reviewedAt: "desc" },
    }),
    prisma.leaveRequest.findMany({
      where: { coverOverrideById: userId },
      orderBy: { coverOverrideAt: "desc" },
    }),
    prisma.jiraUserMapping.findUnique({ where: { userId } }),
    prisma.passwordResetToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userWeeklyHours.findMany({
      where: { userId },
      orderBy: { weekStartDate: "desc" },
    }),
    prisma.leaveCarryOverBalance.findMany({
      where: { userId },
      orderBy: { leaveYear: "desc" },
    }),
    prisma.weeklyEarning.findMany({
      where: { userId },
      orderBy: { weekStartDate: "desc" },
    }),
    prisma.userRegionHistory.findMany({
      where: { userId },
      orderBy: { changedAt: "desc" },
    }),
    prisma.userRegionHistory.findMany({
      where: { changedById: userId },
      orderBy: { changedAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: [
          { actorId: userId },
          { AND: [{ resource: "team_member" }, { resourceId: userId }] },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: auditLimit,
    }),
  ]);

  // Strip the password hash and reset-token strings before serialising.
  const {
    // intentionally extract & drop:
    // (passwordHash is not in our typed UserRow — Prisma still returns it,
    //  so we cast through unknown to access and discard it.)
    ...subjectRest
  } = user as unknown as UserRow & { passwordHash?: string };
  // Belt-and-braces: strip any stray hash key just in case the cast above
  // lets it slip through.
  delete (subjectRest as { passwordHash?: unknown }).passwordHash;

  return {
    exportVersion: SAR_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    exportedBy: params.requestedBy
      ? {
          email: params.requestedBy.email ?? null,
          userId: params.requestedBy.userId ?? null,
        }
      : null,
    subject: {
      ...subjectRest,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      serviceStartDate: isoOrNull(user.serviceStartDate),
    },
    leaveRequests,
    leavesReviewedByThisUser: leavesReviewed,
    leavesCoverOverriddenByThisUser: leavesCoverOverridden,
    jiraMapping,
    passwordResetTokens: resetTokens.map((t) => ({
      id: t.id,
      expiresAt: t.expiresAt.toISOString(),
      usedAt: isoOrNull(t.usedAt),
      createdAt: t.createdAt.toISOString(),
      note: "Token value redacted — security-sensitive credential.",
    })),
    weeklyHours,
    carryOverBalances,
    weeklyEarnings,
    regionHistoryAsSubject: regionHistory,
    regionChangesMadeByThisUser: regionChangesMade,
    auditLogActivity: auditEntries,
  };
}

export function sarExportFilename(user: { email: string; id: string }, now: Date): string {
  const safeEmail = user.email.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const ts = now.toISOString().slice(0, 10);
  return `sar-export-${safeEmail}-${ts}.json`;
}
