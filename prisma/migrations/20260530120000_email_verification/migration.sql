-- Email verification at signup. New signups land with `emailVerified = NULL`
-- and receive a verification email; existing users predate the feature and
-- are marked verified so the new banner / future feature gates don't kick
-- them out of their own product.

ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);

UPDATE "User" SET "emailVerified" = NOW() WHERE "emailVerified" IS NULL;

CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
