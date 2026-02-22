import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { slack, isSlackConfigured, getNotificationChannel } from "@/lib/slack";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSlackConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      botName: null,
      channel: null,
    });
  }

  try {
    const result = await slack!.auth.test();
    return NextResponse.json({
      configured: true,
      connected: true,
      botName: result.user,
      teamName: result.team,
      channel: getNotificationChannel(),
    });
  } catch (error) {
    console.error("Slack connection test failed:", error);
    return NextResponse.json({
      configured: true,
      connected: false,
      botName: null,
      channel: getNotificationChannel(),
      error: "Failed to connect to Slack",
    });
  }
}
