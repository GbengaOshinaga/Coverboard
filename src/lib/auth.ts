import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
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
    // Google OAuth — uncomment and add env vars to enable
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    // }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        const u = user as unknown as Record<string, unknown>;
        token.id = u.id;
        token.role = u.role;
        token.memberType = u.memberType;
        token.organizationId = u.organizationId;
        token.organizationName = u.organizationName;
        token.plan = u.plan;
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
