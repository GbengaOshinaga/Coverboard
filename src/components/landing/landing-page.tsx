"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Phone,
  Users,
  Globe,
  ShieldCheck,
  Check,
  ArrowRight,
} from "lucide-react";
import { LandingNavbar } from "./navbar";
import { PricingSection } from "./pricing-section";
import { LandingFooter } from "./footer";
import { PRICING } from "@/config/pricing";

function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/60 to-white" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-100/40 blur-3xl -z-10" />

      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="mb-6 text-sm font-semibold uppercase tracking-wider text-brand-700">
          STAFF COVER FOR UK SHIFT-BASED TEAMS
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
          Know who's off. Know where you're short.
          <br />
        </h1>

        <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          When someone calls in sick, log it and see exactly which shift is short and who&apos;s free to cover. Coverboard helps shift-based teams manage leave, absence and cover in one place.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3.5 rounded-md text-base transition-colors"
          >
            Start free <ArrowRight size={18} />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium px-6 py-3.5 text-base transition-colors"
          >
            See how it works
          </a>
        </div>

        {/* Trust bar — credibility + risk-reversal signals (all factual). */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-brand-600" aria-hidden />
            UK GDPR compliant
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Globe size={15} className="text-brand-600" aria-hidden />
            UK data residency
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check size={15} className="text-brand-600" aria-hidden />
            No card required
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check size={15} className="text-brand-600" aria-hidden />
            Cancel anytime
          </span>
        </div>
      </div>

      <SickCallSequence />
    </section>
  );
}

// The 7:10am story, told with what the product really does: a manager logs the
// call, the short shift shows up, and the cover list matches CoverOptions
// (contract type for who's free; the clashing shift for who isn't). No
// "notify" or "ask to cover" step: Coverboard doesn't message staff.
const sickCallCandidates = [
  { name: "Sarah T.", note: "Variable hours · 22h this week", free: true, reason: "Free" },
  { name: "Priya K.", note: "Zero-hours · 8h this week", free: true, reason: "Free" },
  { name: "Tom R.", note: "Night shift until 08:00", free: false, reason: "Needs 11h rest" },
];

function SickCallSequence() {
  return (
    <div className="mt-16 mx-auto max-w-5xl px-6">
      <p className="mb-4 text-center text-sm font-medium text-gray-500">
        Tuesday, 7:10am. Your phone rings.
      </p>
      <div className="grid gap-4 md:grid-cols-3" aria-label="Example: logging a sick call and finding cover">
        <div className="flex flex-col rounded-lg border border-gray-300 bg-white p-5 motion-safe:animate-rise">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tabular-nums text-gray-400">07:10</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-600">
              <Phone className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold text-gray-900">Amara calls in sick</p>
          <p className="mt-1 text-sm text-gray-500">Care · Day shift, 08:00–20:00</p>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 md:mt-auto">
            <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            Logged by the manager on shift
          </div>
        </div>

        <div className="rounded-lg border border-red-300 bg-white p-5 motion-safe:animate-rise motion-safe:[animation-delay:400ms]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tabular-nums text-gray-400">07:11</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-red-50 text-red-600">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold text-gray-900">Day shift is short</p>
          <p className="mt-1 text-sm text-gray-500">Care · minimum 5 on shift</p>
          <div className="mt-5 flex items-end justify-between">
            <p className="text-4xl font-bold tabular-nums text-red-600">
              4<span className="text-xl font-semibold text-gray-400"> / 5</span>
            </p>
            <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
              1 person needed
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-sm bg-gray-100">
            <div className="h-full w-4/5 rounded-sm bg-red-500" />
          </div>
        </div>

        <div className="rounded-lg border border-emerald-300 bg-white p-5 motion-safe:animate-rise motion-safe:[animation-delay:800ms]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tabular-nums text-gray-400">07:11</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
              <Users className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold text-gray-900">Who could cover</p>
          <ul className="mt-3 divide-y divide-gray-100">
            {sickCallCandidates.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${c.free ? "text-gray-900" : "text-gray-400 line-through"}`}>
                    {c.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">{c.note}</p>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    c.free ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"
                  }`}
                >
                  {c.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-gray-500">
        From the call to knowing who to ring, without digging through the rota.
      </p>
    </div>
  );
}

function MiniCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4" aria-hidden>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">{label}</p>
      {children}
    </div>
  );
}

function LeavePreview() {
  return (
    <MiniCard label="Leave request">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Fatima K.</p>
        <span className="text-xs text-gray-500">Annual leave</span>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">Wed 19 – Fri 21 · 3 days</p>
      <p className="text-xs text-gray-600 mt-3">
        Balance after: <span className="font-semibold text-gray-900">12 of 28 days</span>
      </p>
      <div className="mt-3 flex gap-2">
        <span className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white">Approve</span>
        <span className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600">Decline</span>
      </div>
    </MiniCard>
  );
}

function AbsencePreview() {
  return (
    <MiniCard label="Absence">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Priya S.</p>
        <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Sick</span>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">Thu 20 – Fri 21 · Care staff – nights</p>
      <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
        <p className="text-xs font-semibold text-red-700">Cover impact</p>
        <p className="text-xs text-red-700 mt-0.5">Nights drop to 3 of 4 on 2 days</p>
      </div>
    </MiniCard>
  );
}

function CoverPreview() {
  const week = [
    { day: "M", ok: true },
    { day: "T", ok: true },
    { day: "W", ok: true },
    { day: "T", ok: false },
    { day: "F", ok: false },
    { day: "S", ok: true },
    { day: "S", ok: true },
  ];
  return (
    <MiniCard label="Cover · Care staff – nights">
      <div className="flex justify-between text-xs text-gray-600">
        <span>
          Minimum <span className="font-semibold text-gray-900">4</span>
        </span>
        <span>
          Available <span className="font-semibold text-red-700">3</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {week.map((d, i) => (
          <div
            key={i}
            className={`rounded-md py-1.5 text-center text-[11px] font-medium ${
              d.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-100 text-red-700"
            }`}
          >
            {d.day}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs font-medium text-red-700">Below minimum Thu &amp; Fri</p>
    </MiniCard>
  );
}

const pillars = [
  {
    title: "Leave",
    description: "Manage requests, balances and approvals.",
    preview: LeavePreview,
  },
  {
    title: "Absence",
    description: "See how sickness affects your team.",
    preview: AbsencePreview,
  },
  {
    title: "Cover",
    description: "See who's available and get warned before a request leaves you short.",
    preview: CoverPreview,
  },
];

// Mirrors what CoverOptions shows (src/components/leave/cover-options.tsx),
// built on the rules in src/lib/shiftCover.ts. Hours are scheduled hours from
// working patterns. Don't add "ask to cover" or qualifications until the
// product has them.
const coverRows = [
  { name: "Leah W.", note: "Zero-hours · 12h this week", free: true, reason: "Free" },
  { name: "Ben C.", note: "Part-time · 20h this week", free: true, reason: "Free" },
  { name: "Jas P.", note: "Lunch shift until 16:00", free: false, reason: "Needs 11h rest" },
  { name: "Dan M.", note: "", free: false, reason: "On leave" },
];

const findCoverPoints = [
  {
    title: "See the gap, shift by shift",
    description:
      "Minimums are set per shift and per day of the week, so a short night shows up even when the day looks fine.",
  },
  {
    title: "See who's free, and who isn't",
    description:
      "Everyone who isn't working, isn't on leave and would still get 11 hours' rest, with their contract and hours already scheduled that week. Anyone ruled out shows why.",
  },
  {
    title: "Decide, and keep a record",
    description:
      "Arrange cover with the people listed, then approve. If you approve below minimum, the override is logged.",
  },
];

// Kept deliberately quiet: cover is the pitch. Per-plan detail lives in pricing.
const hrEssentials = [
  "Holiday entitlement",
  "all UK statutory leave types",
  "fit notes",
  "6-year holiday records",
  "audit trail",
];

function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-brand-600 mb-3">Leave · Absence · Cover</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Everything you need to keep shifts covered.
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            Leave and absence change your staffing. Coverboard shows you the
            impact before it becomes a problem.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-lg border border-gray-200 bg-gray-50 p-5 md:p-6">
              <p.preview />
              <h3 className="mt-6 text-lg font-semibold text-gray-900">{p.title}</h3>
              <p className="mt-1 text-gray-600 text-sm leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          <span className="font-medium text-gray-700">Plus the HR essentials:</span>{" "}
          {hrEssentials.join(" · ")}.{" "}
          <Link href="/pricing" className="whitespace-nowrap text-brand-600 hover:text-brand-700">
            See what&apos;s in each plan
          </Link>
        </p>
      </div>
    </section>
  );
}

function FindCoverSection() {
  return (
    <section id="find-cover" className="py-20 md:py-28 bg-brand-50/40 border-y border-brand-100">
      <div className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-10 md:gap-14 items-center">
        <div>
          <p className="text-sm font-semibold text-brand-600 mb-3">Finding cover</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Before you say yes, see the gap.
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            When a holiday request would leave a shift below minimum, you see it
            before you approve, along with who could step in.
          </p>
          <ul className="mt-8 space-y-5">
            {findCoverPoints.map((p) => (
              <li key={p.title} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">{p.title}</h3>
                  <p className="mt-0.5 text-sm text-gray-600 leading-relaxed">{p.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5" aria-hidden>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Holiday request · Marcus J.</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">Saturday · Evening</p>
              <p className="text-xs text-gray-500">Kitchen · 17:00–23:00</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3 w-3" />
              1 person needed
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">Approving leaves 2 of 3 on shift</p>

          <p className="mt-5 mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Could cover
          </p>
          <ul className="divide-y divide-gray-100 text-sm">
            {coverRows.map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className={r.free ? "text-gray-900" : "text-gray-400 line-through"}>
                    {r.name}
                  </p>
                  {r.note && <p className="text-xs text-gray-500">{r.note}</p>}
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    r.free ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"
                  }`}
                >
                  {r.reason}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Cover arranged? Approve the request. If you approve below minimum, the
            override is recorded in the audit history.
          </div>
        </div>
      </div>
    </section>
  );
}

// Mirrors the payroll report (src/lib/payroll-columns.ts). Figures use the
// 2026/27 rates: SSP £123.25 a week (5-day week, so £24.65 a day), SMP and
// SPP £194.32 a week, paid by calendar day (÷ 7). Keep claims to what the
// report really works out.
const payRows = [
  { name: "Priya S.", type: "SSP", detail: "6 qualifying days", amount: "£147.90" },
  { name: "Amara O.", type: "SMP", detail: "31 days at the flat rate", amount: "£860.62" },
  { name: "Tom B.", type: "Paternity pay", detail: "2 weeks from 12 Oct", amount: "£388.64" },
  { name: "Sam R.", type: "Leaver", detail: "4.5 days' holiday owed", amount: "£432.00" },
];

const statutoryPayPoints = [
  {
    title: "Sick pay from the first day off",
    description:
      "Qualifying days come from their working pattern, linked spells are joined up, and the right weekly rate is applied.",
  },
  {
    title: "Maternity, adoption, paternity, shared parental and neonatal pay",
    description:
      "Earnings and service tests at the right week, the 90% weeks then the flat rate, and the weeks left to share.",
  },
  {
    title: "Holiday pay, including for leavers",
    description:
      "A 52-week average rate on every day of holiday, and the holiday owed to anyone whose last day falls in the period.",
  },
  {
    title: "Ready for your payroll",
    description:
      "One report per pay period, as CSV or Excel, with the dates and basis behind every figure.",
  },
];

function StatutoryPaySection() {
  return (
    <section id="statutory-pay" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-10 md:gap-14 items-center">
        <div className="md:order-2">
          <p className="text-sm font-semibold text-brand-600 mb-3">Statutory pay</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            The pay that goes with the leave, worked out.
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            Book the leave and Coverboard works out who qualifies, which weeks are paid and at
            what rate. Each pay period, the payroll report lists every statutory payment, ready
            for your payroll provider.
          </p>
          <ul className="mt-8 space-y-5">
            {statutoryPayPoints.map((p) => (
              <li key={p.title} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">{p.title}</h3>
                  <p className="mt-0.5 text-sm text-gray-600 leading-relaxed">{p.description}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/guides/uk-statutory-leave-types"
            className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            UK statutory leave types explained
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="md:order-1 rounded-lg border border-gray-200 bg-white p-5" aria-hidden>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Payroll report</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">1 – 31 October 2026</p>
            </div>
            <div className="flex gap-1.5">
              <span className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">CSV</span>
              <span className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">Excel</span>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-gray-100 text-sm">
            {payRows.map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-gray-900">
                    {r.name} <span className="text-xs text-gray-500">· {r.type}</span>
                  </p>
                  <p className="text-xs text-gray-500">{r.detail}</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">{r.amount}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Every figure comes with its dates and basis, so your payroll provider can check it.
          </div>
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    step: "01",
    title: "Leave is booked or sickness is logged",
    description:
      "Staff book holiday from their phone. When someone calls in sick, a manager logs it in a few taps. Either way, a gap shows up straight away.",
  },
  {
    step: "02",
    title: "Coverboard checks cover",
    description:
      "You see, shift by shift, whether approving leaves the team below its minimum, and who else is already off.",
  },
  {
    step: "03",
    title: "Find cover",
    description:
      "For each short shift, you see who could cover it: not working, not on leave, and with 11 hours' rest either side.",
  },
  {
    step: "04",
    title: "Everyone stays in the loop",
    description:
      "Approve once cover is sorted. Balances and the team calendar update straight away, the employee hears back by email or Slack, and any override is recorded.",
  },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-gray-50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-brand-600 mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            From &ldquo;someone&apos;s off&rdquo; to &ldquo;you&apos;re covered.&rdquo;
          </h2>
        </div>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s) => (
            <li key={s.step}>
              <p className="text-sm font-bold text-brand-600 tracking-wide mb-3">{s.step}</p>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{s.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{s.description}</p>
            </li>
          ))}
        </ol>

        <p className="mt-14 text-center text-sm text-gray-600">
          Setup takes minutes: add your teams, set minimum cover, invite your staff.{" "}
          <Link
            href="/signup"
            className="font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
          >
            Start free
          </Link>
        </p>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-br from-brand-600 to-brand-800 relative overflow-hidden">
      <div className="absolute inset-0 -z-0 opacity-10">
        <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      <div className="mx-auto max-w-3xl px-6 text-center relative z-10">
        <ShieldCheck size={40} className="text-white/80 mx-auto mb-6" />
        <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
          Stop finding out you&apos;re short-staffed at the last minute.
        </h2>
        <p className="mt-4 text-lg text-brand-100 max-w-xl mx-auto">
          See who&apos;s off and where you&apos;re short, before you approve the
          next request.
        </p>
        <div className="mt-10 flex justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold px-8 py-3.5 rounded-md text-base transition-colors hover:bg-brand-50"
          >
            Start free <ArrowRight size={18} />
          </Link>
        </div>
        <p className="mt-4 text-sm text-brand-100/80">
          Free up to 5 employees. No card required. No contract.
        </p>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <LandingNavbar />
      <HeroSection />
      <FeaturesSection />
      <FindCoverSection />
      <StatutoryPaySection />
      <HowItWorksSection />
      <PricingSection />
      <CTASection />
      <LandingFooter />
    </div>
  );
}
