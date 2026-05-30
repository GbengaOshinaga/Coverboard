// IMPORTANT — this is a reasonable UK-SaaS starting point reflecting how
// Coverboard actually works (14-day trial, GBP pricing, 30-day deletion
// grace, England & Wales jurisdiction). It is NOT a substitute for review
// by a qualified solicitor. Get this looked at before going live.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement between you and Coverboard for using the Coverboard service.",
};

const LAST_UPDATED = "28 May 2026";

export default function TermsPage() {
  return (
    <article className="space-y-6 text-gray-800">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-gray-500">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <section className="space-y-3">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) form a binding agreement
          between you (&ldquo;you&rdquo;, &ldquo;your&rdquo;) and Coverboard
          (&ldquo;Coverboard&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;,
          &ldquo;our&rdquo;) governing your use of the Coverboard team-leave
          management service and any related websites, dashboards, APIs and
          email notifications (collectively the &ldquo;Service&rdquo;). By
          creating an account or using the Service you confirm that you have
          read, understood and agree to be bound by these Terms.
        </p>
      </section>

      <Section title="1. Who we are">
        <p>
          Coverboard provides software for managing employee leave, statutory
          pay tracking and related People-Ops workflows. References to
          &ldquo;Coverboard&rdquo; mean the entity that operates the Service.
          Our registered details and a contact email for legal notices are
          available at <em>support@coverboard.io</em>.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          You must be at least 18 years old and have authority to bind your
          employer or organisation (the &ldquo;Customer&rdquo;) to these Terms
          if you sign up on its behalf. You are responsible for keeping your
          account credentials confidential and for any activity that happens
          under your account. Notify us promptly if you suspect unauthorised
          access.
        </p>
        <p>
          You are responsible for the accuracy of the information you and your
          team members enter, including the leave records, employment data and
          sickness notes you choose to store in the Service.
        </p>
      </Section>

      <Section title="3. Subscription, trial and billing">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            New Customers receive a <strong>14-day free trial</strong> of the
            Service with no payment card required. During the trial you have
            access to the features included in your selected plan.
          </li>
          <li>
            If you do not add a payment method before the trial ends, your
            organisation will be paused and your data is scheduled for
            permanent deletion 30 days later. You may reactivate by adding a
            card before that 30-day window closes.
          </li>
          <li>
            Paid subscriptions are billed monthly in advance in pounds sterling
            (GBP) by our payment processor, Stripe Payments Europe Ltd. Plan
            prices are shown on the pricing page and may be updated from time
            to time on reasonable notice.
          </li>
          <li>
            You may upgrade or downgrade your plan at any time from your
            billing settings. Plan changes are prorated.
          </li>
          <li>
            You may cancel at any time. Cancellation takes effect at the end
            of your current billing period, after which your account is locked
            and scheduled for deletion in line with section 7.
          </li>
          <li>
            All prices are exclusive of VAT or other applicable taxes, which
            we will collect where required by law and itemise on your invoice.
          </li>
        </ul>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            violate any applicable law, including data protection, employment
            and equality law;
          </li>
          <li>
            upload data you do not have the right to share, or sensitive
            categories of personal data beyond what the Service is designed
            to handle (for example, biometric or genetic data);
          </li>
          <li>
            reverse-engineer, scrape, or attempt to circumvent the Service&rsquo;s
            security, rate limits or access controls;
          </li>
          <li>
            resell the Service to third parties without a separate written
            agreement with us;
          </li>
          <li>
            send unsolicited marketing or spam through the Service&rsquo;s
            notification features.
          </li>
        </ul>
        <p>
          We may suspend or terminate access for serious or repeated
          violations of this section. Where practical we will give you notice
          and a chance to remediate first.
        </p>
      </Section>

      <Section title="5. Customer data and confidentiality">
        <p>
          Personal data you and your team members submit (&ldquo;Customer
          Data&rdquo;) remains your data. You instruct us to process it on
          your behalf for the sole purpose of providing the Service. See our{" "}
          <a href="/privacy" className="text-brand-600 hover:underline">
            Privacy Policy
          </a>{" "}
          for details on how we process personal data, our sub-processors and
          data retention periods.
        </p>
        <p>
          We treat your Customer Data and any business information you share
          with us as confidential. We will not access, use or disclose it
          except as needed to provide the Service, comply with law, or with
          your instruction.
        </p>
      </Section>

      <Section title="6. Intellectual property">
        <p>
          We retain all rights, title and interest in the Service, including
          all software, designs, documentation and trade marks. You retain
          all rights in your Customer Data. Subject to these Terms, we grant
          you a limited, non-exclusive, non-transferable right to access and
          use the Service for the duration of your subscription.
        </p>
        <p>
          If you provide feedback or suggestions, you grant us a perpetual,
          royalty-free licence to use them to improve the Service.
        </p>
      </Section>

      <Section title="7. Term, suspension and termination">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            These Terms remain in effect while you use the Service.
          </li>
          <li>
            You may delete your account at any time from Settings. Deletion
            enters a 30-day grace period during which you may reverse it.
            After the grace period, your organisation&rsquo;s data is
            permanently and irreversibly removed from active systems.
          </li>
          <li>
            We may suspend or terminate your account for a material breach of
            these Terms, for non-payment after a reasonable cure period, or if
            required by law. We will notify you where practical.
          </li>
          <li>
            Sections that by their nature should survive (including
            confidentiality, IP, disclaimers, limitation of liability,
            indemnity and governing law) will survive termination.
          </li>
        </ul>
      </Section>

      <Section title="8. Warranties and disclaimers">
        <p>
          We will provide the Service with reasonable skill and care. Beyond
          that, and to the extent permitted by law, the Service is provided
          &ldquo;as is&rdquo; without further warranties of any kind, express
          or implied, including warranties of merchantability, fitness for a
          particular purpose, or non-infringement.
        </p>
        <p>
          Coverboard helps you track and report on statutory leave and pay,
          but you remain responsible for your compliance with employment law,
          HMRC obligations and any decisions you make based on the
          Service&rsquo;s outputs. Statutory rates, calculations and reports
          should be reviewed by qualified payroll or legal personnel.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>
          Nothing in these Terms limits or excludes liability that cannot be
          limited or excluded under English law, including liability for death
          or personal injury caused by negligence, or for fraud.
        </p>
        <p>
          Subject to the above, our total aggregate liability arising out of
          or in connection with the Service in any 12-month period will not
          exceed the fees you paid us during that period. Neither party will
          be liable for indirect, special, incidental, consequential or
          punitive damages, or for loss of profits, revenue, goodwill or
          anticipated savings.
        </p>
      </Section>

      <Section title="10. Indemnity">
        <p>
          You agree to indemnify us against claims arising from your Customer
          Data, your use of the Service in breach of these Terms, or your
          breach of applicable law in relation to your team or your customers.
        </p>
      </Section>

      <Section title="11. Changes to the Service or these Terms">
        <p>
          We may update the Service and these Terms from time to time. Where
          changes are material, we will give you reasonable advance notice by
          email or in-app notification. Your continued use of the Service
          after a change takes effect constitutes acceptance of the updated
          Terms.
        </p>
      </Section>

      <Section title="12. Governing law and jurisdiction">
        <p>
          These Terms and any dispute arising out of them are governed by the
          laws of <strong>England and Wales</strong>. The courts of England
          and Wales have exclusive jurisdiction over any such dispute, except
          that we may seek injunctive relief in any competent court.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          Questions about these Terms? Email{" "}
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
