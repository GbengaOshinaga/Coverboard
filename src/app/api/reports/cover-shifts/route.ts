import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadAcceptedCoverShifts, type CoverShiftRow } from "@/lib/cover-shifts";
import {
  parseExportFormat,
  toCsv,
  toExcel,
  EXPORT_CONTENT_TYPE,
  exportFilename,
  type ExportColumn,
} from "@/lib/export-formats";

/**
 * Cover shifts worked (accepted cover offers) in a period, for payroll: extra
 * shifts on top of each person's usual pattern. Separate from the leave
 * export because it's paid work, not absence. Same formats as /payroll.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = session.user as Record<string, unknown>;
  const role = sessionUser.role as string;
  if (role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const orgId = sessionUser.organizationId as string;

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const from = searchParams.get("from")
    ? new Date(searchParams.get("from") as string)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = searchParams.get("to")
    ? new Date(searchParams.get("to") as string)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid 'from' or 'to' date parameter" }, { status: 400 });
  }

  const rows = await loadAcceptedCoverShifts({ organizationId: orgId, from, to });
  const totals = {
    shifts: rows.length,
    hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
  };

  const format = parseExportFormat(searchParams.get("format"));
  if (format === "json") {
    return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), rows, totals });
  }

  const columns: ExportColumn<CoverShiftRow>[] = [
    { key: "userId", header: "Employee ID" },
    { key: "userName", header: "Name" },
    { key: "email", header: "Email" },
    { key: "department", header: "Department" },
    { key: "employmentType", header: "Employment type" },
    { key: "date", header: "Date" },
    { key: "shiftName", header: "Shift" },
    { key: "startTime", header: "Start" },
    { key: "endTime", header: "End" },
    { key: "hours", header: "Hours" },
    { key: "locationName", header: "Location" },
    { key: "coveringFor", header: "Covering for" },
  ];
  const filename = exportFilename(
    `coverboard-cover-shifts-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}`,
    format,
    new Date()
  );
  if (format === "csv") {
    return new NextResponse(toCsv(rows, columns), {
      status: 200,
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPE.csv,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const buffer = await toExcel([{ name: "Cover shifts", columns, rows }]);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": EXPORT_CONTENT_TYPE.excel,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
