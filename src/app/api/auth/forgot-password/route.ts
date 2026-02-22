import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
});

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });

    // Always return success to avoid leaking whether an email exists
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        token,
        expiresAt,
        userId: user.id,
      },
    });

    const resetUrl = `${BASE_URL}/reset-password?token=${token}`;
    const { subject, html } = passwordResetEmail({
      userName: user.name,
      resetUrl,
    });

    await sendEmail({ to: email, subject, html });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
