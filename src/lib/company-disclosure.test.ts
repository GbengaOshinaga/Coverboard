import test from "node:test";
import assert from "node:assert/strict";
import { COMPANY, COMPANY_DISCLOSURE } from "@/config/company";
import { billingEmailLayout } from "./billing-emails";
import { passwordResetEmail } from "./email-templates";

test("every email layout ends with the company's registered details", () => {
  const app = passwordResetEmail({ userName: "Jo", resetUrl: "https://example.com/r" }).html;
  const billing = billingEmailLayout("<p>Your trial ends soon.</p>");
  for (const html of [app, billing]) {
    assert.ok(html.includes(COMPANY.number), "company number");
    assert.ok(html.includes(COMPANY.registeredOffice), "registered office");
  }
  assert.match(COMPANY_DISCLOSURE, /registered in England and Wales, company number \d{8}\./);
  assert.match(COMPANY.icoRegistration, /^Z[A-Z0-9]\d{6}$/, "ICO registration number");
});
