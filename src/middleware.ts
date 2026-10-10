import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isPathnameForbiddenForMember } from "@/lib/member-route-access";

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
  /^\/account\/delete(\/|$)/,
  /^\/api\/billing(\/|$)/,
  /^\/api\/account(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/health(\/|$)/,
  /^\/login(\/|$)/,
  /^\/signup(\/|$)/,
  /^\/logout(\/|$)/,
];

// What a held admin still needs: Billing and the team list to fix it, their
// own leave and their staff's requests (leave still has to be approved), help,
// the email links for verifying their address or resetting a password, and
// onboarding (the dashboard sends an unfinished team there, so holding it
// would bounce between the two).
const ALLOWED_WHEN_OVER_PLAN: RegExp[] = [
  /^\/settings\/billing(\/|$)/,
  /^\/settings\/profile(\/|$)/,
  /^\/team(\/|$)/,
  /^\/requests(\/|$)/,
  /^\/my-time-off(\/|$)/,
  /^\/help(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/account(\/|$)/,
  /^\/verify-email(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/reset-password(\/|$)/,
  /^\/login(\/|$)/,
  /^\/logout(\/|$)/,
];

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) return NextResponse.next();

  const path = request.nextUrl.pathname;

  // Marked as left while signed in (see the jwt callback): drop the session
  // cookie and send them to the login page, which refuses inactive accounts.
  if (token.revoked) {
    if (/^\/api\/auth(\/|$)/.test(path)) return NextResponse.next();
    const response = path.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : /^\/login(\/|$)/.test(path)
        ? NextResponse.next()
        : NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.includes("next-auth.session-token")) response.cookies.delete(cookie.name);
    }
    return response;
  }

  // A user who authenticated via Google but hasn't created a team yet has no
  // organizationId in their token. Send them to /welcome to finish signup;
  // everything else (the page itself, NextAuth routes, signout) is allowed.
  if (!token.organizationId) {
    const allowedWithoutOrg =
      /^\/welcome(\/|$)/.test(path) ||
      /^\/api\/auth(\/|$)/.test(path) ||
      /^\/logout(\/|$)/.test(path);
    if (!allowedWithoutOrg) {
      const welcomeUrl = request.nextUrl.clone();
      welcomeUrl.pathname = "/welcome";
      welcomeUrl.search = "";
      return NextResponse.redirect(welcomeUrl);
    }
    return NextResponse.next();
  }

  const plan = token.plan as string | undefined;
  if (plan === "LOCKED") {
    if (ALLOWED_WHEN_LOCKED.some((re) => re.test(path))) {
      return NextResponse.next();
    }
    const lockedUrl = request.nextUrl.clone();
    lockedUrl.pathname = "/locked";
    lockedUrl.search = "";
    return NextResponse.redirect(lockedUrl);
  }

  const role = token.role as string | undefined;

  // The team is bigger than the plan it pays for (e.g. a 90-person trial
  // that converted onto Growth): admins go to Billing until it fits. They
  // can still reach the team list to mark people who've left, and the pages
  // in ALLOWED_WHEN_OVER_PLAN. Everyone else
  // carries on; APIs aren't blocked, so nothing half-finished breaks.
  if (token.overPlan && role === "ADMIN" && !path.startsWith("/api/") && !ALLOWED_WHEN_OVER_PLAN.some((re) => re.test(path))) {
    const billingUrl = request.nextUrl.clone();
    billingUrl.pathname = "/settings/billing";
    billingUrl.search = "";
    return NextResponse.redirect(billingUrl);
  }
  if (role === "MEMBER" && isPathnameForbiddenForMember(path)) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    dashUrl.search = "";
    return NextResponse.redirect(dashUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except next-internal paths and public assets.
    "/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ico)$).*)",
  ],
};
