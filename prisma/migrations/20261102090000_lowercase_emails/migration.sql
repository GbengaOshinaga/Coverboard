-- Emails are stored in lower case from now on (src/lib/email-address.ts), so
-- Jo@Care.co.uk and jo@care.co.uk are one account. Convert existing rows.
-- Two accounts that differ only by capitals can't both be kept; stop with a
-- clear message rather than half-converting, so they can be merged by hand.
DO $$
DECLARE clash text;
BEGIN
  SELECT string_agg(lower_email, ', ') INTO clash FROM (
    SELECT lower("email") AS lower_email FROM "User"
    GROUP BY lower("email") HAVING count(*) > 1
  ) d;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'Accounts differ only by capitals, merge them first: %', clash;
  END IF;
END $$;

UPDATE "User" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
