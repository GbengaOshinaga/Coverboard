import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSarExport, sarExportFilename } from "@/lib/sar-export";
import { recordAudit, requestAuditContext } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  if (sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const organizationId = sessionUser.organizationId as string;
  const now = new Date();

  const exportData = await buildSarExport({
    prisma,
    organizationId,
    userId: id,
    requestedBy: {
      email: (session.user.email as string | null) ?? null,
      userId: (sessionUser.id as string | null) ?? null,
    },
    now,
  });

  if (!exportData) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await recordAudit({
    organizationId,
    action: "data_export.sar",
    resource: "team_member",
    resourceId: id,
    actor: {
      id: sessionUser.id as string,
      email: (session.user.email as string | null) ?? null,
      role: sessionUser.role as string,
    },
    metadata: {
      subjectEmail: exportData.subject.email,
      exportVersion: exportData.exportVersion,
    },
    context: requestAuditContext(request),
  });

  const filename = sarExportFilename(
    { email: exportData.subject.email, id: exportData.subject.id },
    now
  );

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
