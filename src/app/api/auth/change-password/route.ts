import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { encode, getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// The session cookie, named and secured as NextAuth does (getToken's defaults).
const SECURE_COOKIE = process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
const SESSION_COOKIE = SECURE_COOKIE ? "__Secure-next-auth.session-token" : "next-auth.session-token";
const SESSION_MAX_AGE = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;
    const userId = (session.user as Record<string, unknown>).id as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Ends every session signed in with the old password. This browser keeps
    // its session: its token is re-issued here with the new version, so it's
    // never signed out (rather than signing out and back in from the page).
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });

    const response = NextResponse.json({ success: true });
    const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
    const token = await getToken({ req: request, secret, secureCookie: SECURE_COOKIE });
    if (token && secret) {
      const value = await encode({
        token: { ...token, sessionVersion: updated.sessionVersion },
        secret,
        maxAge: SESSION_MAX_AGE,
      });
      response.cookies.set(SESSION_COOKIE, value, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: SECURE_COOKIE,
        maxAge: SESSION_MAX_AGE,
      });
    }
    return response;
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
