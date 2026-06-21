import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  checkAuthRateLimit,
  getClientIpFromAuthorizeReq,
} from "@/lib/rate-limit";

// Google sign-in is opt-in: the provider is only registered when both env
// vars are present, so the "Continue with Google" button (which checks
// /api/auth/providers) simply doesn't appear until it's configured.
const googleEnabled =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

/**
 * Populates the JWT with our domain fields from the DB user matching `email`.
 * Used for Google sign-ins (whose OAuth profile lacks org/role/plan) and to
 * pick up a freshly-created org after Google sign-up completes. No-op when no
 * matching account exists yet (a brand-new Google user pre-team-creation).
 */
async function hydrateTokenFromEmail(token: JWT, email?: string | null) {
  if (!email) return;
  const dbUser = await prisma.user.findUnique({
    where: { email },
    include: { organization: true },
  });
  if (!dbUser) return;
  token.id = dbUser.id;
  token.role = dbUser.role;
  token.memberType = dbUser.memberType;
  token.organizationId = dbUser.organizationId;
  token.organizationName = dbUser.organization.name;
  token.plan = dbUser.organization.plan;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Rate-limit login attempts by IP. On overflow we throw so NextAuth
        // surfaces a useful message on the login page instead of the generic
        // "Invalid credentials" (which would conflate brute-force throttling
        // with real bad-password feedback).
        const rateLimit = await checkAuthRateLimit(
          getClientIpFromAuthorizeReq(req?.headers),
          "login"
        );
        if (!rateLimit.ok) {
          throw new Error(
            `Too many sign-in attempts. Try again in ${rateLimit.retryAfterSeconds}s.`
          );
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { organization: true },
        });

        if (!user) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          memberType: user.memberType,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          plan: user.organization.plan,
        };
      },
    }),
    // Google OAuth — registered only when GOOGLE_CLIENT_ID/SECRET are set.
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // The credentials flow is fully validated in authorize() above.
      if (account?.provider !== "google") return true;

      // Only trust an email Google has itself verified.
      const email = user.email;
      const verifiedByGoogle = (
        profile as { email_verified?: boolean } | undefined
      )?.email_verified;
      if (!email || verifiedByGoogle === false) {
        return "/login?error=GoogleEmail";
      }

      // Existing account → sign in (and backfill verification for invited
      // members who never clicked the email link). Brand-new Google users are
      // allowed through too; middleware routes them to /welcome to create a
      // team, after which their account exists.
      const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, emailVerified: true },
      });
      if (dbUser && !dbUser.emailVerified) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { emailVerified: new Date() },
        });
      }

      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        if (account?.provider === "google") {
          // The OAuth `user` carries Google's profile, not our domain fields.
          // For a brand-new Google user there's no DB record yet, so the token
          // stays org-less and middleware routes them to /welcome.
          await hydrateTokenFromEmail(token, user.email);
        } else {
          const u = user as unknown as Record<string, unknown>;
          token.id = u.id;
          token.role = u.role;
          token.memberType = u.memberType;
          token.organizationId = u.organizationId;
          token.organizationName = u.organizationName;
          token.plan = u.plan;
        }
      } else if (trigger === "update" && !token.organizationId && token.email) {
        // A Google user who just created their team via /welcome calls
        // update() — pick up the new org so the session carries it.
        await hydrateTokenFromEmail(token, token.email as string);
      }
      // Refresh plan from DB on explicit update() or once per hour so the
      // lock/middleware sees current state without forcing a re-login.
      const HOUR = 60 * 60 * 1000;
      const lastRefresh = (token.planRefreshedAt as number | undefined) ?? 0;
      if (trigger === "update" || Date.now() - lastRefresh > HOUR) {
        if (token.organizationId) {
          const org = await prisma.organization.findUnique({
            where: { id: token.organizationId as string },
            select: { plan: true },
          });
          if (org) {
            token.plan = org.plan;
            token.planRefreshedAt = Date.now();
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id;
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).memberType = token.memberType;
        (session.user as Record<string, unknown>).organizationId = token.organizationId;
        (session.user as Record<string, unknown>).organizationName = token.organizationName;
        (session.user as Record<string, unknown>).plan = token.plan;
      }
      return session;
    },
  },
};
