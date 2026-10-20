-- The reason an approver gives when rejecting a request (optional), shown to
-- the employee in the email, in Slack and on the request.
ALTER TABLE "LeaveRequest" ADD COLUMN "reviewNote" TEXT;
