/**
 * Public https origin for absolute links in emails and OAuth redirects.
 *
 * - Set `NEXTAUTH_URL` per environment (e.g. staging vs production in Vercel).
 *   That is the canonical value NextAuth already expects.
 * - On Vercel, `VERCEL_URL` is injected per deployment; we use it only as a
 *   fallback when `NEXTAUTH_URL` is missing (common on preview deployments).
 * - There is no reliable "current browser URL" in server-only or background code.
 */
export function getAppBaseUrl(): string {
  const fromAuth = process.env.NEXTAUTH_URL?.trim();
  if (fromAuth) return fromAuth.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}
