// IMPORTANT — this Privacy Policy reflects how Coverboard actually
// processes personal data (sub-processors, retention, residency, SAR
// route) as of writing. It is a reasonable UK-GDPR starting point but is
// NOT a substitute for review by a qualified data-protection lawyer.
// Get this looked at before going live, and re-check whenever you add a
// sub-processor.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Coverboard collects, uses, stores and shares personal data — your rights under UK GDPR.",
};

const LAST_UPDATED = "28 May 2026";

export default function PrivacyPage() {
  return (
    <article className="space-y-6 text-gray-800">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <section className="space-y-3 text-sm leading-relaxed text-gray-700">
        <p>
          This Privacy Policy explains how Coverboard
          (&ldquo;Coverboard&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
          collects, uses and protects personal data when you use our
          team-leave management service (the &ldquo;Service&rdquo;) and our
          website.
        </p>
        <p>
          Coverboard is a UK company hosted in the United Kingdom. We comply
          with the UK General Data Protection Regulation (UK GDPR) and the
          Data Protection Act 2018.
        </p>
      </section>

      <Section title="1. Controller and processor roles">
        <p>
          For data about your customers&rsquo; employees that an
          organisation stores in the Service (leave records, sickness notes,
          earnings history, etc.), the Customer is the <strong>data
          controller</strong> and Coverboard is the <strong>data
          processor</strong>. We process this data on the Customer&rsquo;s
          documented instructions, as set out in our Terms of Service.
        </p>
        <p>
          For data we collect directly from individuals interacting with our
          website or signing up for an account (your name, email, billing
          details), Coverboard is the controller.
        </p>
      </Section>

      <Section title="2. What we collect">
        <p>The personal data we process includes:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Account data</strong>: name, work email, hashed password,
            organisation name, role, country of work.
          </li>
          <li>
            <strong>Billing data</strong>: company name, plan, payment-card
            details (held by Stripe — we never see the full card number),
            invoice history.
          </li>
          <li>
            <strong>Employee leave data</strong>: leave types, dates,
            statuses, approval history, statutory pay calculations,
            optional sickness notes, optional evidence flags.
          </li>
          <li>
            <strong>Right-to-work and employment data</strong>: verification
            flag and metadata (no document images stored).
          </li>
          <li>
            <strong>Communications</strong>: emails you send to our support
            address, in-app feedback.
          </li>
          <li>
            <strong>Technical data</strong>: IP address, user agent,
            authentication session cookie, anonymised audit-log entries.
          </li>
        </ul>
      </Section>

      <Section title="3. Lawful bases for processing">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Contract</strong> (UK GDPR Art. 6(1)(b)) — to provide the
            Service to you under your subscription.
          </li>
          <li>
            <strong>Legitimate interests</strong> (Art. 6(1)(f)) — to keep
            the Service secure, prevent abuse, send service-related emails
            and improve the product. We have weighed our interests against
            your rights and consider this proportionate.
          </li>
          <li>
            <strong>Legal obligation</strong> (Art. 6(1)(c)) — to retain
            financial records and respond to lawful requests.
          </li>
          <li>
            <strong>Consent</strong> (Art. 6(1)(a)) — where we explicitly
            ask for it (for example, before sending non-essential marketing
            emails).
          </li>
        </ul>
        <p>
          For sickness notes and other special-category data submitted by
          Customer employees, the lawful basis is the employer&rsquo;s
          obligation under employment law and social-security law (Art.
          9(2)(b)).
        </p>
      </Section>

      <Section title="4. How we use it">
        <ul className="list-disc space-y-1 pl-6">
          <li>To operate, maintain and improve the Service.</li>
          <li>
            To send transactional emails (welcome, leave-request
            notifications, billing receipts, trial reminders).
          </li>
          <li>
            To detect and prevent fraud, abuse and security incidents.
          </li>
          <li>
            To comply with HMRC, financial, employment and data-protection
            obligations.
          </li>
          <li>
            To send the optional weekly digest to admins and managers (you
            can opt out from your profile settings).
          </li>
        </ul>
      </Section>

      <Section title="5. Sub-processors">
        <p>
          We use a small set of trusted sub-processors to provide the
          Service. We have a data-processing agreement in place with each.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Vercel Inc.</strong> — application hosting and serverless
            execution (UK and EU regions).
          </li>
          <li>
            <strong>Supabase Inc.</strong> — managed PostgreSQL hosting for
            the application database.
          </li>
          <li>
            <strong>Stripe Payments Europe Ltd.</strong> — subscription
            billing, payment processing, invoice generation.
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery.
          </li>
          <li>
            <strong>Slack Technologies Inc.</strong> — only when a Customer
            chooses to connect Slack for leave notifications.
          </li>
          <li>
            <strong>Atlassian Jira (Atlassian Pty Ltd)</strong> — only when a
            Customer chooses to connect Jira.
          </li>
        </ul>
        <p>
          We will give reasonable advance notice (typically in-app and via
          email to admins) before adding or replacing a sub-processor.
        </p>
      </Section>

      <Section title="6. Data residency">
        <p>
          Customer Data is stored in the European Union (Republic of
          Ireland, AWS <code>eu-west-1</code> region, via our database
          provider Supabase). Application servers run on Vercel&rsquo;s
          edge and serverless infrastructure within the UK and EU regions.
        </p>
        <p>
          Some sub-processors (notably Stripe, Slack and Atlassian) may
          process data outside the UK and EU. Where they do, we rely on UK
          International Data Transfer Agreements, EU Standard Contractual
          Clauses or equivalent safeguards to ensure your data receives an
          essentially equivalent level of protection.
        </p>
        <p>
          Transfers between the UK and the EU are covered by the UK
          Government&rsquo;s adequacy decision for the EU, which means data
          can flow to and from the EU without additional safeguards.
        </p>
      </Section>

      <Section title="7. Retention">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Active organisations</strong>: Customer Data is retained
            for as long as your subscription is active.
          </li>
          <li>
            <strong>Cancelled or expired organisations</strong>: data enters
            a 30-day grace period during which an admin can reactivate.
            After 30 days, the organisation&rsquo;s team members, leave
            requests, audit logs and integrations are permanently deleted
            and the organisation record is anonymised to a stub.
          </li>
          <li>
            <strong>Anonymisation under data-retention policy</strong>: Admins
            can run a retention sweep that anonymises personal notes and
            sickness notes on leave records older than the configured cutoff
            (default 6 years after the leave end date — the standard UK
            recommendation). Statutory shell fields (dates, leave type,
            SSP/SMP figures) are preserved so historical pay records remain
            reportable.
          </li>
          <li>
            <strong>Billing records</strong>: retained for the period
            required by UK tax law (currently 6 years).
          </li>
          <li>
            <strong>Audit logs</strong>: retained for the life of the
            organisation; purged on full deletion.
          </li>
        </ul>
      </Section>

      <Section title="8. Your rights">
        <p>
          Under UK GDPR you have the right to:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>access the personal data we hold about you;</li>
          <li>have it corrected if it is inaccurate;</li>
          <li>
            have it erased (subject to our right to retain it for legal or
            legitimate reasons);
          </li>
          <li>restrict or object to certain processing;</li>
          <li>
            receive a copy of your data in a structured, commonly used,
            machine-readable format;
          </li>
          <li>
            withdraw consent at any time where processing is based on
            consent.
          </li>
        </ul>
        <p>
          For employees of a Customer organisation, the route to exercise
          these rights is via your employer (the data controller). Coverboard
          provides admins with a one-click <strong>Subject Access Request
          export</strong> from each employee&rsquo;s profile, producing a
          machine-readable JSON file containing every record we hold about
          that employee.
        </p>
        <p>
          For data we hold about you as a Customer (account holder), email
          our data-protection contact at{" "}
          <a
            href="mailto:dpo@coverboard.io"
            className="text-brand-600 hover:underline"
          >
            dpo@coverboard.io
          </a>{" "}
          and we will respond within one month, as required by UK GDPR.
        </p>
        <p>
          You also have the right to lodge a complaint with the Information
          Commissioner&rsquo;s Office (ICO) at{" "}
          <a
            href="https://ico.org.uk/"
            className="text-brand-600 hover:underline"
            rel="noopener"
          >
            ico.org.uk
          </a>
          .
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          We use industry-standard measures to protect personal data,
          including encrypted storage, role-based access controls, an
          append-only audit log of writes and (on the Pro plan)
          read-side audit, secure password hashing (bcrypt), and rate
          limiting on authentication endpoints. No system is perfectly
          secure; you are responsible for keeping your own credentials
          confidential and reporting suspected incidents to us promptly.
        </p>
      </Section>

      <Section title="10. Cookies">
        <p id="cookies">
          We use a small number of cookies that are <strong>strictly
          necessary</strong> for the Service to work — primarily an
          authentication session cookie (set by NextAuth) and a CSRF token.
          These do not require consent under PECR.
        </p>
        <p>
          We do not currently use analytics or advertising cookies. If we
          add any in future, we will request your consent first via the
          cookie banner and will list each cookie&rsquo;s purpose and
          duration here. The banner choice is itself recorded in a
          first-party cookie so we don&rsquo;t ask repeatedly.
        </p>
        <p>
          You can clear cookies in your browser at any time. Doing so will
          log you out of the Service.
        </p>
      </Section>

      <Section title="11. Children">
        <p>
          The Service is not intended for individuals under 16 years old. We
          do not knowingly collect personal data from children.
        </p>
      </Section>

      <Section title="12. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. Where changes
          are material we will give reasonable advance notice. The latest
          version is always available at this URL with the &ldquo;Last
          updated&rdquo; date at the top.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          Questions about how we handle your data, or any data-subject
          request (access, correction, deletion, portability)? Email our
          data-protection contact at{" "}
          <a
            href="mailto:dpo@coverboard.io"
            className="text-brand-600 hover:underline"
          >
            dpo@coverboard.io
          </a>
          . For general or billing questions, use{" "}
          <a
            href="mailto:support@coverboard.io"
            className="text-brand-600 hover:underline"
          >
            support@coverboard.io
          </a>
          .
        </p>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}
