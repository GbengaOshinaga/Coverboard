// Cookie-consent helpers. The cookie banner sets a first-party cookie that
// records the user's choice; this module exposes a typed read API plus an
// event so client components (e.g. the PostHog provider) can react when the
// user changes their mind.

export const CONSENT_COOKIE_NAME = "cb_cookie_consent_v1";
export const CONSENT_EVENT_NAME = "cb:consent-change";

export type ConsentValue = "granted" | "rejected";

export function readConsent(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (!match) return null;
  const raw = decodeURIComponent(match.split("=")[1] ?? "");
  if (raw === "granted" || raw === "rejected") return raw;
  // Forward-compat: the previous banner wrote `acknowledged` / `dismissed`.
  if (raw === "acknowledged") return "granted";
  if (raw === "dismissed") return "rejected";
  return null;
}

export function writeConsent(value: ConsentValue): void {
  if (typeof document === "undefined") return;
  const oneYearSeconds = 365 * 24 * 60 * 60;
  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${oneYearSeconds}; SameSite=Lax`;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<ConsentValue>(CONSENT_EVENT_NAME, { detail: value })
    );
  }
}

export function hasAnalyticsConsent(): boolean {
  return readConsent() === "granted";
}
