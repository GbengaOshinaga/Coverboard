import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { topUpHolidaysForAllTeams } from "@/lib/holiday-years";

/**
 * Monthly: makes sure every team has this year's and next year's bank and
 * public holidays (src/lib/holiday-years.ts). Teams are only given years when
 * they're set up, so without this they'd run out; running monthly rather than
 * once a year means a missed run is caught up next month. Adding is
 * idempotent.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ success: true, ...(await topUpHolidaysForAllTeams(new Date())) });
  } catch (error) {
    console.error("Holidays cron failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Vercel cron triggers send GET by default.
export async function GET(request: Request) {
  return POST(request);
}
