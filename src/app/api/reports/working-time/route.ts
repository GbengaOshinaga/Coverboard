import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { workingTimeRows } from "@/lib/working-time-server";
import { WORKING_TIME_COLUMNS, referenceWeeks } from "@/lib/working-time";
import { EXPORT_CONTENT_TYPE, exportFilename, parseExportFormat, toCsv } from "@/lib/export-formats";

/**
 * Working time for UK staff over the last 17 full weeks: average weekly
 * hours against the 48-hour limit, opt-outs, and rest gaps under 11 hours.
 * JSON for the Reports tab, or ?format=csv.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as Record<string, unknown>;
  if (u.role !== "ADMIN" && u.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const today = new Date();
  const weeks = referenceWeeks(today);
  const rows = await workingTimeRows(u.organizationId as string, today);

  if (parseExportFormat(new URL(request.url).searchParams.get("format")) === "csv") {
    return new NextResponse(toCsv(rows, WORKING_TIME_COLUMNS), {
      status: 200,
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPE.csv,
        "Content-Disposition": `attachment; filename="${exportFilename("working-time", "csv", today)}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json({ from: weeks[0], toWeekStarting: weeks[weeks.length - 1], rows });
}
