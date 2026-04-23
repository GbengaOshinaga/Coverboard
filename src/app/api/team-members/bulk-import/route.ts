import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { teamMemberSchema } from "@/lib/validations";
import { sendTeamInviteEmail } from "@/lib/email-notifications";
import { recordAudit, requestAuditContext } from "@/lib/audit";

// Cap the batch size to keep single-request latency bounded and avoid abuse.
// Larger imports should be split client-side.
const MAX_ROWS = 100;

const bulkSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_ROWS),
  dryRun: z.boolean().optional().default(false),
});

type RowError = { index: number; field?: string; message: string };

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userRole = sessionUser.role as string;
  const orgId = sessionUser.organizationId as string;

  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { rows, dryRun } = parsed.data;

  type ValidRow = {
    index: number;
    data: z.infer<typeof teamMemberSchema>;
  };

  const errors: RowError[] = [];
  const valid: ValidRow[] = [];

  rows.forEach((row, i) => {
    const result = teamMemberSchema.safeParse(row);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          index: i,
          field: issue.path.join(".") || undefined,
          message: issue.message,
        });
      }
      return;
    }
    valid.push({ index: i, data: result.data });
  });

  // Detect duplicate emails within the batch (case-insensitive).
  const seen = new Map<string, number>();
  for (const v of valid) {
    const key = v.data.email.toLowerCase();
    const firstIdx = seen.get(key);
    if (firstIdx !== undefined) {
      errors.push({
        index: v.index,
        field: "email",
        message: `Duplicate email in batch (first seen on row ${firstIdx + 1})`,
      });
    } else {
      seen.set(key, v.index);
    }
  }

  // Detect collisions with existing users.
  const emailList = valid.map((v) => v.data.email);
  const existing = emailList.length
    ? await prisma.user.findMany({
        where: { email: { in: emailList } },
        select: { email: true },
      })
    : [];
  const existingSet = new Set(existing.map((e) => e.email.toLowerCase()));
  for (const v of valid) {
    if (existingSet.has(v.data.email.toLowerCase())) {
      errors.push({
        index: v.index,
        field: "email",
        message: "Email already exists",
      });
    }
  }

  // Enforce the plan-level admin seat cap across the whole batch.
  const newAdminCount = valid.filter((v) => v.data.role === "ADMIN").length;
  let adminCapMessage: string | null = null;
  if (newAdminCount > 0) {
    const [org, currentAdmins] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { maxAdminUsers: true, plan: true },
      }),
      prisma.user.count({
        where: { organizationId: orgId, role: "ADMIN" },
      }),
    ]);
    const unlimitedAdminsPlan =
      org?.plan === "GROWTH" || org?.plan === "SCALE" || org?.plan === "PRO";
    if (
      org &&
      !unlimitedAdminsPlan &&
      org.maxAdminUsers > 0 &&
      currentAdmins + newAdminCount > org.maxAdminUsers
    ) {
      const remaining = Math.max(0, org.maxAdminUsers - currentAdmins);
      adminCapMessage = `Your plan allows up to ${org.maxAdminUsers} admin users (${currentAdmins} already used). Reduce admin rows to ${remaining} or upgrade.`;
      errors.push({
        index: -1,
        field: "role",
        message: adminCapMessage,
      });
    }
  }

  const rowErrorIndices = new Set(
    errors.filter((e) => e.index >= 0).map((e) => e.index)
  );
  const importable = valid.filter((v) => !rowErrorIndices.has(v.index));
  const batchBlocked = adminCapMessage !== null;

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      total: rows.length,
      valid: batchBlocked ? 0 : importable.length,
      invalid: rows.length - (batchBlocked ? 0 : importable.length),
      errors,
    });
  }

  if (batchBlocked || errors.length > 0) {
    return NextResponse.json(
      {
        error:
          "Validation failed. Resolve the reported errors, or call with dryRun: true to preview them.",
        errors,
      },
      { status: 400 }
    );
  }

  // Hash passwords outside the transaction so bcrypt CPU cost doesn't hold a DB
  // transaction open.
  const toCreate = await Promise.all(
    importable.map(async (v) => {
      const tempPassword = Math.random().toString(36).slice(-10);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      return { data: v.data, tempPassword, passwordHash };
    })
  );

  const created = await prisma.$transaction(
    toCreate.map(({ data, passwordHash }) =>
      prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          role: data.role,
          memberType: data.memberType,
          employmentType: data.employmentType,
          daysWorkedPerWeek: data.daysWorkedPerWeek,
          fteRatio: data.fteRatio,
          rightToWorkVerified: data.rightToWorkVerified ?? null,
          department: data.department ?? null,
          countryCode: data.countryCode,
          organizationId: orgId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          countryCode: true,
        },
      })
    )
  );

  const inviterName = session.user.name ?? "Your admin";
  const orgName =
    (sessionUser.organizationName as string) ?? "your team";

  created.forEach((member, i) => {
    sendTeamInviteEmail({
      inviteeName: member.name,
      inviterName,
      orgName,
      email: member.email,
      tempPassword: toCreate[i].tempPassword,
    }).catch((err) =>
      console.error("Bulk invite email error:", member.email, err)
    );
  });

  const auditContext = requestAuditContext(request);
  const actor = {
    id: sessionUser.id as string,
    email: session.user.email ?? null,
    role: userRole,
  };

  await recordAudit({
    organizationId: orgId,
    action: "team_member.bulk_imported",
    resource: "team_member",
    actor,
    metadata: {
      count: created.length,
      emails: created.map((c) => c.email),
    },
    context: auditContext,
  });

  for (const member of created) {
    recordAudit({
      organizationId: orgId,
      action: "team_member.created",
      resource: "team_member",
      resourceId: member.id,
      actor,
      metadata: {
        name: member.name,
        email: member.email,
        role: member.role,
        countryCode: member.countryCode,
        source: "bulk_import",
      },
      context: auditContext,
    });
  }

  return NextResponse.json(
    { imported: created.length, members: created },
    { status: 201 }
  );
}
