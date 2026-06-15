-- Enable Row Level Security on all Coverboard application tables in `public`.
--
-- Context (Supabase + Prisma):
-- - Supabase exposes `public` to PostgREST; RLS should be ON so API access is not
--   wide open if `anon` / `authenticated` ever reach these tables.
-- - This app uses Prisma on the server with a direct Postgres connection. The
--   migration/connection role is typically the table owner (or a role that
--   bypasses RLS), so enabling RLS without policies does NOT block Prisma:
--   owners bypass RLS unless FORCE ROW LEVEL SECURITY is set (we do not set it).
-- - With RLS enabled and no policies, `anon` / `authenticated` get no rows via
--   the Data API (deny-by-default for those roles).
--
-- Do not enable RLS on `_prisma_migrations` here; leave Prisma’s migration
-- history table untouched.

-- Organization
ALTER TABLE public."Organization" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Organization" FROM anon, authenticated;

-- User
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."User" FROM anon, authenticated;

-- LeaveType
ALTER TABLE public."LeaveType" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LeaveType" FROM anon, authenticated;

-- LeavePolicy
ALTER TABLE public."LeavePolicy" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LeavePolicy" FROM anon, authenticated;

-- LeaveRequest
ALTER TABLE public."LeaveRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LeaveRequest" FROM anon, authenticated;

-- JiraIntegration
ALTER TABLE public."JiraIntegration" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."JiraIntegration" FROM anon, authenticated;

-- JiraUserMapping
ALTER TABLE public."JiraUserMapping" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."JiraUserMapping" FROM anon, authenticated;

-- PasswordResetToken
ALTER TABLE public."PasswordResetToken" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PasswordResetToken" FROM anon, authenticated;

-- PublicHoliday
ALTER TABLE public."PublicHoliday" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PublicHoliday" FROM anon, authenticated;

-- BankHoliday
ALTER TABLE public."BankHoliday" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."BankHoliday" FROM anon, authenticated;

-- UserWeeklyHours
ALTER TABLE public."UserWeeklyHours" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserWeeklyHours" FROM anon, authenticated;

-- LeaveCarryOverBalance
ALTER TABLE public."LeaveCarryOverBalance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LeaveCarryOverBalance" FROM anon, authenticated;

-- WeeklyEarning
ALTER TABLE public."WeeklyEarning" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."WeeklyEarning" FROM anon, authenticated;

-- AuditLog
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AuditLog" FROM anon, authenticated;

-- Region
ALTER TABLE public."Region" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Region" FROM anon, authenticated;

-- UserRegionHistory
ALTER TABLE public."UserRegionHistory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserRegionHistory" FROM anon, authenticated;

-- DataDeletionAudit
ALTER TABLE public."DataDeletionAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DataDeletionAudit" FROM anon, authenticated;
