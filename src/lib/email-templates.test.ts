import test from "node:test";
import assert from "node:assert/strict";
import {
  leaveCancelledForYouEmail,
  leaveRequestStatusEmail,
  leaveRequestSubmittedEmail,
  rightToWorkRecheckEmail,
  weeklyDigestEmail,
} from "./email-templates";

const NASTY = `Eve <a href="https://evil.example">click</a>`;

test("names and notes typed by staff are escaped in email HTML", () => {
  const { html, subject } = leaveRequestSubmittedEmail({
    requesterName: NASTY,
    leaveTypeName: "Annual Leave",
    startDate: new Date("2026-11-02T00:00:00Z"),
    endDate: new Date("2026-11-06T00:00:00Z"),
    daysRequested: 5,
    note: `<img src=x onerror=alert(1)>`,
    dashboardUrl: "https://app.example/requests",
  });
  assert.equal(html.includes(`<a href="https://evil.example">`), false);
  assert.equal(html.includes("<img src=x"), false);
  assert.ok(html.includes("Eve &lt;a href=&quot;https://evil.example&quot;&gt;click&lt;/a&gt;"));
  // Subject lines are plain text, not HTML.
  assert.ok(subject.includes(NASTY));
});

test("a leave colour that isn't a plain hex colour can't break out of the style attribute", () => {
  const { html } = weeklyDigestEmail({
    recipientName: "Sam",
    orgName: "Care Home",
    weekLabel: "w/c 2 Nov",
    outThisWeek: [
      {
        name: "Ada",
        leaveType: "Annual Leave",
        leaveColor: `red;background:url(https://evil.example)`,
        startDate: new Date("2026-11-02T00:00:00Z"),
        endDate: new Date("2026-11-03T00:00:00Z"),
      },
    ],
    outNextWeek: [],
    pendingCount: 0,
    dashboardUrl: "https://app.example",
    unsubscribeUrl: "https://app.example/unsubscribe",
  });
  assert.equal(html.includes("evil.example"), false);
  assert.ok(html.includes("#6b7280"));
});

test("leave a manager recorded says so, rather than 'your request was approved'", () => {
  const email = leaveRequestStatusEmail({
    requesterName: "Ada",
    status: "APPROVED",
    leaveTypeName: "Statutory Maternity Leave",
    startDate: new Date("2026-10-26T00:00:00Z"),
    endDate: new Date("2027-10-24T00:00:00Z"),
    daysRequested: 260,
    reviewerName: "QA Admin",
    dashboardUrl: "https://app.example/requests",
    recorded: true,
  });
  assert.equal(email.subject, "Your Statutory Maternity Leave has been recorded");
  assert.ok(email.html.includes("QA Admin has recorded this leave for you"));
});

test("right-to-work recheck email lists expired first and escapes names", () => {
  const { subject, html } = rightToWorkRecheckEmail({
    recipientName: "Sam",
    orgName: "Care Home",
    items: [
      { name: "Eve <b>", expiresOn: new Date("2026-10-01T00:00:00Z"), expired: true },
      { name: "Tom", expiresOn: new Date("2026-11-20T00:00:00Z"), expired: false },
    ],
    reportUrl: "https://app.example/reports?tab=right-to-work",
  });
  assert.equal(subject, "1 right-to-work check expired — Care Home");
  assert.ok(html.includes("Eve &lt;b&gt;"));
  assert.ok(html.includes("Permission expired 1 Oct 2026: recheck now"));
  assert.ok(html.includes("Recheck before 20 Nov 2026"));
});

test("leave cancelled by an approver: names and leave type are escaped", () => {
  const { subject, html } = leaveCancelledForYouEmail({
    name: "Ann <b>",
    cancellerName: "<script>x</script>",
    leaveTypeName: "Annual & Leave",
    startDate: new Date("2027-03-01T00:00:00Z"),
    endDate: new Date("2027-03-05T00:00:00Z"),
    dashboardUrl: "https://example.test/my-time-off",
  });
  assert.equal(subject, "Your Annual & Leave has been cancelled");
  assert.ok(!html.includes("<script>x</script>"));
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;"));
  assert.ok(html.includes("Annual &amp; Leave"));
  assert.ok(html.includes("Ann &lt;b&gt;"));
});
