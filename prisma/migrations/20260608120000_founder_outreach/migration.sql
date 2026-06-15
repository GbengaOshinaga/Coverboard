-- One-off founder outreach to the first N orgs. Nullable timestamp doubles as
-- a single-send guard and an audit trail of who got the email and when.
ALTER TABLE "Organization" ADD COLUMN "founderEmailSentAt" TIMESTAMP(3);
