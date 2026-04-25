-- Organization: deletion lifecycle fields
ALTER TABLE "Organization"
  ADD COLUMN "trialExpiredGraceEndsAt" TIMESTAMP(3),
  ADD COLUMN "deletionRequestedAt"     TIMESTAMP(3),
  ADD COLUMN "deletionScheduledFor"    TIMESTAMP(3),
  ADD COLUMN "deletionConfirmedAt"     TIMESTAMP(3),
  ADD COLUMN "deletionReason"          TEXT;

CREATE INDEX "Organization_deletionScheduledFor_idx"
  ON "Organization" ("deletionScheduledFor");

CREATE INDEX "Organization_trialExpiredGraceEndsAt_idx"
  ON "Organization" ("trialExpiredGraceEndsAt");

-- Audit trail for deletion lifecycle events
CREATE TABLE "DataDeletionAudit" (
    "id"                TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "organizationName"  TEXT NOT NULL,
    "adminEmail"        TEXT,
    "event"             TEXT NOT NULL,
    "reason"            TEXT,
    "scheduledFor"      TIMESTAMP(3),
    "metadata"          JSONB,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataDeletionAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataDeletionAudit_organizationId_createdAt_idx"
  ON "DataDeletionAudit" ("organizationId", "createdAt");

CREATE INDEX "DataDeletionAudit_event_createdAt_idx"
  ON "DataDeletionAudit" ("event", "createdAt");
