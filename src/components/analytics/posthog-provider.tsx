"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { identifyUser, initPostHog, resetAnalytics } from "@/lib/analytics/client";
import {
  CONSENT_EVENT_NAME,
  hasAnalyticsConsent,
  type ConsentValue,
} from "@/lib/consent";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [consented, setConsented] = useState(false);

  // Gate PostHog init on cookie-banner consent. Reads on mount, then
  // listens for the consent-change event so accepting cookies takes effect
  // without a page reload. If consent is revoked we reset the in-browser
  // PostHog state.
  useEffect(() => {
    setConsented(hasAnalyticsConsent());
    function onChange(e: Event) {
      const value = (e as CustomEvent<ConsentValue>).detail;
      if (value === "granted") {
        setConsented(true);
      } else {
        setConsented(false);
        resetAnalytics();
      }
    }
    window.addEventListener(CONSENT_EVENT_NAME, onChange);
    return () => window.removeEventListener(CONSENT_EVENT_NAME, onChange);
  }, []);

  useEffect(() => {
    if (!consented) return;
    initPostHog();
  }, [consented]);

  useEffect(() => {
    if (!consented) return;
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
  }, [session, status, consented]);

  return <>{children}</>;
}
