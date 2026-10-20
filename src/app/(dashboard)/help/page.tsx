import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Mail, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/require-active-session";
import {
  hasPrioritySupport,
  hasSlaSupport,
  PLAN_LABELS,
  type AnyPlan,
} from "@/lib/plans";
import { computeTrialState } from "@/lib/trial";
import { GLOSSARY } from "@/lib/glossary";

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@coverboard.io";
const PRIORITY_EMAIL =
  process.env.NEXT_PUBLIC_PRIORITY_SUPPORT_EMAIL ?? "support@coverboard.io";
const SLA_EMAIL =
  process.env.NEXT_PUBLIC_SLA_SUPPORT_EMAIL ?? "support@coverboard.io";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type HowTo = { question: string; answer: React.ReactNode };

const linkCls = "font-medium text-brand-600 hover:text-brand-700";

/** For admins and managers: the jobs a new manager looks for first. */
const MANAGER_HOW_TOS: HowTo[] = [
  {
    question: "Add someone to the team",
    answer: (
      <>
        Go to <Link href="/team" className={linkCls}>Team</Link> and choose Add
        member. Enter their name and email, and they&apos;ll get an email
        inviting them to set a password. To add lots of people at once, use
        Bulk import.
      </>
    ),
  },
  {
    question: "Approve or reject a request",
    answer: (
      <>
        Go to <Link href="/requests" className={linkCls}>Requests</Link>. The
        number next to it in the menu is how many are waiting. Choose Approve,
        or Reject and add a reason if you want to. They&apos;re emailed either
        way.
      </>
    ),
  },
  {
    question: "Book leave for someone",
    answer: (
      <>
        Go to <Link href="/requests/new" className={linkCls}>New request</Link>{" "}
        and pick them under Who is it for?. Leave you book for someone is
        approved straight away, so agree it with them first.
      </>
    ),
  },
  {
    question: "Record someone off sick",
    answer: (
      <>
        Book it the same way and choose the sick leave type. Staff can also
        tell you themselves with I&apos;m off sick on their My time off page.
        If they&apos;re off for more than 7 days in a row, record their fit
        note on the absence in Requests.
      </>
    ),
  },
  {
    question: "Set up shifts and minimum cover",
    answer: (
      <>
        Coverboard doesn&apos;t draw up rotas, but it uses your shifts and each
        person&apos;s usual pattern to show who&apos;s covering. Turn on
        Locations under Optional features in{" "}
        <Link href="/settings" className={linkCls}>Settings</Link>, then in{" "}
        <Link href="/settings/regions" className={linkCls}>Locations</Link> add
        each location with its minimum cover and use Shifts to add your shift
        times. Then open each person from Team and set their Working pattern.
      </>
    ),
  },
];

/** For staff: booking and reporting their own time off. */
const STAFF_HOW_TOS: HowTo[] = [
  {
    question: "Book time off",
    answer: (
      <>
        Go to <Link href="/my-time-off" className={linkCls}>My time off</Link>{" "}
        and choose Request time off. Your manager is emailed, and you&apos;ll
        get an email when they decide.
      </>
    ),
  },
  {
    question: "Tell your manager you're off sick",
    answer: (
      <>
        Go to <Link href="/my-time-off" className={linkCls}>My time off</Link>{" "}
        and choose I&apos;m off sick. It&apos;s recorded straight away. If
        you&apos;re off for more than 7 days in a row, you&apos;ll need a fit
        note from your GP.
      </>
    ),
  },
  {
    question: "Check how much holiday you have left",
    answer: (
      <>
        It&apos;s at the top of{" "}
        <Link href="/my-time-off" className={linkCls}>My time off</Link>, along
        with what you&apos;ve booked.
      </>
    ),
  },
  {
    question: "See who else is off",
    answer: (
      <>
        Look at the <Link href="/calendar" className={linkCls}>Calendar</Link>.
        Colleagues show as Away; only managers see the reason.
      </>
    ),
  },
];

/** Which email to use, the reply we aim for, and a line about the plan. */
function supportFor(
  plan: AnyPlan | undefined,
  trialEndsAt: Date | null,
  isAdmin: boolean
): { email: string; reply: string; planNote: React.ReactNode } {
  const trial = plan === "TRIAL" ? computeTrialState(trialEndsAt) : null;
  const billingLink = isAdmin ? (
    <>
      {" "}
      <Link href="/settings/billing" className={linkCls}>Choose a plan</Link>
    </>
  ) : null;

  if (trial?.tone === "ended") {
    return {
      email: CONTACT_EMAIL,
      reply: "within a week",
      planNote: (
        <>
          Your trial ended on {DATE_FMT.format(trial.endsAt)}.{billingLink}
        </>
      ),
    };
  }

  const planNote =
    plan === "TRIAL"
      ? trial
        ? `You're on a free trial until ${DATE_FMT.format(trial.endsAt)}.`
        : "You're on a free trial."
      : plan && plan !== "LOCKED"
        ? `You're on the ${PLAN_LABELS[plan]} plan.`
        : null;

  if (hasSlaSupport(plan)) {
    return { email: SLA_EMAIL, reply: "within 2 working days", planNote };
  }
  if (hasPrioritySupport(plan)) {
    return { email: PRIORITY_EMAIL, reply: "within 3 working days", planNote };
  }
  return {
    email: CONTACT_EMAIL,
    reply: "within a week",
    planNote: (
      <>
        {planNote} Scale and Pro get a faster reply.
        {billingLink}
      </>
    ),
  };
}

export default async function HelpPage() {
  const { session, orgId } = await requireActiveSession();
  const role = (session.user as Record<string, unknown>).role as string | undefined;
  const isAdmin = role === "ADMIN";
  const canManage = isAdmin || role === "MANAGER";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true, trialEndsAt: true },
  });
  const support = supportFor(org?.plan as AnyPlan | undefined, org?.trialEndsAt ?? null, isAdmin);
  const howTos = canManage ? MANAGER_HOW_TOS : STAFF_HOW_TOS;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
        Help &amp; contact
      </h1>

      <Card id="how-to">
        <CardHeader>
          <CardTitle>How do I…</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4 text-sm">
            {howTos.map((h) => (
              <div key={h.question}>
                <dt className="font-medium text-gray-900">{h.question}</dt>
                <dd className="mt-0.5 text-gray-600">{h.answer}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card id="contact">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-brand-600" />
            Contact us
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            Email{" "}
            <a href={`mailto:${support.email}`} className={`break-all ${linkCls}`}>
              {support.email}
            </a>{" "}
            and we&apos;ll aim to reply {support.reply}.
          </p>
          {support.planNote && (
            <p className="text-xs text-gray-500">{support.planNote}</p>
          )}
        </CardContent>
      </Card>

      {/* Glossary: the same words as the "?" hints (src/lib/glossary.ts) */}
      <Card id="glossary">
        <CardHeader>
          <CardTitle>What the terms mean</CardTitle>
          <CardDescription>Plain-English meanings of the terms you&apos;ll see in Coverboard</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            {Object.values(GLOSSARY).map((entry) => (
              <div key={entry.term}>
                <dt className="font-medium text-gray-900">{entry.term}</dt>
                <dd className="mt-0.5 text-gray-600">
                  {entry.meaning}{" "}
                  {"link" in entry && entry.link && (
                    <a
                      href={entry.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 whitespace-nowrap text-brand-600 hover:text-brand-700"
                    >
                      {entry.link.includes("ico.org.uk") ? "More from the ICO" : "More on GOV.UK"}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GOV.UK guidance</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {[
              ["https://www.gov.uk/holiday-entitlement-rights", "Holiday entitlement"],
              ["https://www.gov.uk/employers-sick-pay", "Statutory Sick Pay: employer guide"],
              ["https://www.gov.uk/maternity-pay-leave", "Maternity pay and leave"],
              ["https://www.gov.uk/check-job-applicant-right-to-work", "Right to work checks"],
            ].map(([href, label]) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700"
                >
                  {label}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
