"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Globe,
  ShieldCheck,
  Check,
  ArrowRight,
  Building2,
} from "lucide-react";
import { LandingNavbar } from "./navbar";
import { PricingSection } from "./pricing-section";
import { PRICING } from "@/config/pricing";

function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/60 to-white" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-100/40 blur-3xl -z-10" />

      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-3 py-1.5 text-sm text-brand-700 mb-8">
          STAFF COVER FOR SHIFT-BASED TEAMS
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
          Know who's off. Know where you're short.
          <br />
        </h1>

        <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Coverboard helps shift-based teams manage leave, sickness and staff cover so you can spot coverage gaps before they become a problem.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors shadow-lg shadow-brand-600/20"
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

      {/* Dashboard Preview */}
      <div className="mt-16 mx-auto max-w-5xl px-6">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-200/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="ml-3 text-xs text-gray-400">coverboard.io/dashboard</span>
          </div>
          <div className="p-6 md:p-8">
            <div className="grid md:grid-cols-5 gap-4">
              <div className="md:col-span-3 rounded-xl border border-gray-100 p-4 md:p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-semibold text-gray-900">Today&apos;s coverage</p>
                  <span className="text-xs text-gray-400">Tue 18</span>
                </div>
                <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
                  {[
                    { label: "Teams covered", value: "3", icon: ShieldCheck, color: "text-emerald-700 bg-emerald-50 border-emerald-100" },
                    { label: "Team at risk", value: "1", icon: AlertTriangle, color: "text-amber-700 bg-amber-50 border-amber-200" },
                    { label: "Days below minimum", value: "2", icon: Clock, color: "text-red-700 bg-red-50 border-red-100" },
                  ].map((stat) => (
                    <div key={stat.label} className={`rounded-xl border p-3 md:p-4 ${stat.color}`}>
                      <stat.icon size={18} className="mb-2 opacity-80" aria-hidden />
                      <p className="text-2xl md:text-3xl font-bold">{stat.value}</p>
                      <p className="text-xs md:text-sm font-medium opacity-80 mt-1">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">By team</p>
                {[
                  { team: "Care staff – days", on: 6, min: 5 },
                  { team: "Care staff – nights", on: 3, min: 4, gaps: ["Thu", "Fri"] },
                  { team: "Kitchen", on: 3, min: 2 },
                  { team: "Housekeeping", on: 2, min: 2 },
                ].map((t) => {
                  const atRisk = t.on < t.min;
                  return (
                    <div key={t.team} className="py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-900">{t.team}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {t.on} on / {t.min} min
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              atRisk ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {atRisk ? "At risk" : "Covered"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${atRisk ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(100, (t.on / t.min) * 100)}%` }}
                        />
                      </div>
                      {t.gaps && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-gray-500">Below minimum this week:</span>
                          {t.gaps.map((gap) => (
                            <span
                              key={gap}
                              className="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                            >
                              {gap}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="md:col-span-2 rounded-xl border border-gray-100 p-4 md:p-5">
                <p className="font-semibold text-gray-900 text-sm mb-2">Out today</p>
                {[
                  { name: "Amara O.", detail: "Annual leave · Care (days)" },
                  { name: "Diego R.", detail: "Sick · Care (nights)" },
                ].map((p) => (
                  <div key={p.name} className="py-1.5">
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.detail}</p>
                  </div>
                ))}
                <p className="font-semibold text-gray-900 text-sm mt-3 mb-2">Upcoming</p>
                {[
                  { name: "Fatima K.", dates: "Wed 19 – Fri 21" },
                  { name: "Carlos M.", dates: "Thu 20" },
                ].map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-1.5">
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <span className="text-xs text-gray-400">{p.dates}</span>
                  </div>
                ))}
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                  <span>
                    <span className="font-semibold text-brand-600">3</span> pending requests
                  </span>
                  <span>12 team members</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const scaleHighlights = [
  "Parental leave tracker, KIT & SPLIT day tracking",
  "Holiday pay earnings history & 52-week average calculation",
  "Custom carry-over rules & absence analytics dashboard",
  "UK compliance report pack & priority response",
];

const proHighlights = [
  "Activity log — see who viewed each profile, sickness note, and report",
  "Audit trail exports for governance and investigations",
  "Priority email support (2 working-day target) — everything in Scale included",
];

function TierPrice({ name }: { name: string }) {
  const tier = PRICING.tiers.find((t) => t.name === name);
  if (!tier) return null;
  return (
    <p className="mt-4 flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gray-900">
        {PRICING.currency}
        {tier.price_monthly}
      </span>
      <span className="text-sm text-gray-500">/mo, excl. VAT</span>
    </p>
  );
}

function TierTrialLink({ name }: { name: string }) {
  return (
    <Link
      href={`/signup?plan=${name.toLowerCase()}`}
      className="mt-8 block rounded-xl border-2 border-brand-600 py-2.5 text-center text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
    >
      Start free trial
    </Link>
  );
}

function ScaleAndProSection() {
  return (
    <section id="scale-pro" className="py-20 md:py-28 bg-slate-50 border-y border-slate-100">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center justify-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 mb-4">
            <Building2 className="h-3.5 w-3.5 text-brand-600" />
            Scale &amp; Pro
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            When leave touches payroll, compliance, and audits
          </h2>
          <p className="mt-4 text-gray-600 text-lg leading-relaxed">
            Starter and Growth keep day-to-day leave effortless.{" "}
            <span className="font-medium text-gray-800">Scale</span> adds HR
            operations depth — statutory tracking, payroll-ready figures, and
            reporting your finance team can rely on.{" "}
            <span className="font-medium text-gray-800">Pro</span> layers on
            tamper-evident activity logs and exportable audit history for
            organisations that answer to regulators, boards, or insurers.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Scale
            </p>
            <p className="mt-1 text-sm text-gray-500">Advanced HR operations</p>
            <TierPrice name="Scale" />
            <p className="mt-4 text-sm text-gray-700 leading-relaxed">
              For People teams who need parental programmes, holiday pay
              defensibility, and compliance reporting — without bolting on a
              second HRIS.
            </p>
            <ul className="mt-6 space-y-3">
              {scaleHighlights.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm text-gray-800"
                >
                  <Check
                    size={16}
                    className="text-brand-600 mt-0.5 shrink-0"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
            <TierTrialLink name="Scale" />
          </div>

          <div className="rounded-2xl border border-brand-200 bg-white p-6 md:p-8 shadow-md shadow-brand-100/30 ring-1 ring-brand-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Pro
            </p>
            <p className="mt-1 text-sm text-gray-500">Enterprise controls</p>
            <TierPrice name="Pro" />
            <p className="mt-4 text-sm text-gray-700 leading-relaxed">
              For employers who need a tamper-evident activity trail, SAR
              exports, and priority email support alongside the same leave
              engine your managers already use.
            </p>
            <ul className="mt-6 space-y-3">
              {proHighlights.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm text-gray-800"
                >
                  <Check
                    size={16}
                    className="text-brand-600 mt-0.5 shrink-0"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
            <TierTrialLink name="Pro" />
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-gray-600">
          <a
            href="#pricing"
            className="font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
          >
            Compare plans and pricing
          </a>
        </p>
      </div>
    </section>
  );
}

function MiniCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-hidden>
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
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Sick</span>
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
    description: "Spot gaps and get warned before you approve a request that leaves you short.",
    preview: CoverPreview,
  },
];

const variableHoursWeeks = [
  { week: "Wk 1", hours: 24 },
  { week: "Wk 2", hours: 18 },
  { week: "Wk 3", hours: 31 },
];

const alsoIncluded = [
  "SSP & family pay on the 2026 rules",
  "Bradford Factor",
  "Bank holidays by region",
  "Payroll export",
  "Slack & email approvals",
  "Month-to-month, no contract",
];

function FeaturesSection() {
  const totalHours = variableHoursWeeks.reduce((sum, w) => sum + w.hours, 0);
  return (
    <section id="features" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-brand-600 mb-3">Leave · Absence · Cover</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Everything you need to keep shifts covered.
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            Leave, sickness and minimum staffing in one place, so you see a gap
            before it becomes a problem.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-gray-100 bg-gray-50 p-5 md:p-6">
              <p.preview />
              <h3 className="mt-6 text-lg font-semibold text-gray-900">{p.title}</h3>
              <p className="mt-1 text-gray-600 text-sm leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-brand-100 bg-brand-50/60 p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">
              Built for variable-hours, part-time and zero-hours teams.
            </h3>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              Calculate entitlement correctly, even when working patterns change.
              Irregular-hours holiday accrues at 12.07% of hours worked, tracked in
              hours, not fudged into days.
            </p>
          </div>
          <div className="md:w-72 shrink-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-hidden>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-900">Sarah T.</p>
              <span className="text-xs text-gray-500">Zero-hours</span>
            </div>
            {variableHoursWeeks.map((w) => (
              <div key={w.week} className="flex justify-between py-0.5 text-xs text-gray-600">
                <span>{w.week}</span>
                <span>{w.hours}h worked</span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
              <span className="text-gray-600">Holiday accrued</span>
              <span className="font-semibold text-brand-700">
                {(totalHours * 0.1207).toFixed(1)}h
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <span className="text-sm text-gray-500 mr-1 self-center">Also included:</span>
          {alsoIncluded.map((item) => (
            <span
              key={item}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    step: "01",
    title: "Someone requests leave",
    description:
      "Staff book holiday or report sickness from their phone. If the dates would leave their team short, they're told before they submit.",
  },
  {
    step: "02",
    title: "Coverboard checks cover",
    description:
      "You see, day by day, whether approving leaves the team below its minimum, and who else is already off.",
  },
  {
    step: "03",
    title: "You decide with the full picture",
    description:
      "Approve, decline, or approve anyway when you've sorted cover yourself. Overrides are recorded, so there's a clear trail.",
  },
  {
    step: "04",
    title: "Everyone stays in the loop",
    description:
      "Balances and the team calendar update straight away, and the employee hears back by email or Slack.",
  },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-gray-50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-brand-600 mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            From &ldquo;someone&apos;s off&rdquo; to a decision you can trust.
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
            className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors hover:bg-brand-50 shadow-lg"
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

function Footer() {
  return (
    <footer className="bg-gray-900 py-12 md:py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
                CB
              </div>
              <span className="font-semibold text-white text-lg">Coverboard</span>
            </div>
            <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
              Team leave management for distributed teams and People Ops. Know who&apos;s out, plan coverage, stay compliant.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-12 text-sm sm:grid-cols-3">
            <div>
              <p className="font-semibold text-white mb-3">Product</p>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#scale-pro" className="hover:text-white transition-colors">Scale &amp; Pro</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white mb-3">Account</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/login" className="hover:text-white transition-colors">Log in</Link></li>
                <li><Link href="/signup" className="hover:text-white transition-colors">Sign up</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white mb-3">Legal</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800 text-center text-sm text-gray-500 space-y-2">
          <p>
            UK-resident data &mdash; stored in London on AWS{" "}
            <code className="font-mono text-xs">eu-west-2</code> via Supabase.
            Compliant with the UK GDPR.
          </p>
          <p>
            &copy; {new Date().getFullYear()} Coverboard. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

const COUNTRIES = [
  "UK",
  "Nigeria",
  "Kenya",
  "South Africa",
  "Ghana",
  "Brazil",
  "Mexico",
  "Philippines",
  "Indonesia",
];

function CountriesSection() {
  return (
    <section className="py-10 bg-white border-t border-gray-100">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="text-sm font-semibold text-gray-900">
          Supporting teams across multiple countries
        </p>
        <p className="mt-2 text-sm text-gray-500">{COUNTRIES.join(" · ")}</p>
        <Link
          href="/guides/uk-statutory-leave-types"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          UK statutory compliance
          <ArrowRight size={14} aria-hidden />
        </Link>
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
      <HowItWorksSection />
      <PricingSection />
      <ScaleAndProSection />
      <CTASection />
      <CountriesSection />
      <Footer />
    </div>
  );
}
