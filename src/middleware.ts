import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Locked-account gate. When an org's plan is LOCKED we redirect every page
 * request except the allow-listed escape hatches (billing, account, signout).
 *
 * This runs before the App Router renders the page, so API routes and
 * webhooks are explicitly excluded via the matcher config below.
 */

const ALLOWED_WHEN_LOCKED: RegExp[] = [
  /^\/locked(\/|$)/,
  /^\/settings\/billing(\/|$)/,
  /^\/settings\/profile(\/|$)/,
  /^\/api\/billing(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/login(\/|$)/,
  /^\/signup(\/|$)/,
  /^\/logout(\/|$)/,
];

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) return NextResponse.next();

  const plan = token.plan as string | undefined;
  if (plan !== "LOCKED") return NextResponse.next();

  const path = request.nextUrl.pathname;
  if (ALLOWED_WHEN_LOCKED.some((re) => re.test(path))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/locked";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Run on everything except next-internal paths and public assets.
    "/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ico)$).*)",
  ],
};
