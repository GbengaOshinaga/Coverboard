import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const FEATURE_DISABLED_MESSAGE =
  "Regional management is not enabled for your account. Enable it in Settings → General.";

export async function isRegionsEnabled(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { regionsEnabled: true },
  });
  return Boolean(org?.regionsEnabled);
}

export function regionsDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: "FEATURE_DISABLED", message: FEATURE_DISABLED_MESSAGE },
    { status: 403 }
  );
}
