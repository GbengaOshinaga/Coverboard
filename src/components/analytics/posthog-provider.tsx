"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { identifyUser, initPostHog, resetAnalytics } from "@/lib/analytics/client";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated" || !session?.user) {
      resetAnalytics();
      return;
    }
    const user = session.user as Record<string, unknown>;
    const userId = user.id as string | undefined;
    const organizationId = user.organizationId as string | undefined;
    if (!userId || !organizationId) return;
    identifyUser({
      userId,
      organizationId,
      role: user.role as string | undefined,
      plan: user.plan as string | undefined,
    });
  }, [session, status]);

  return <>{children}</>;
}
