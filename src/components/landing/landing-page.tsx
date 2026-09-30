"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Clock,
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
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-3 py-1.5 text-sm text-brand-700 mb-8">
          STAFF COVER FOR SHIFT-BASED TEAMS
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
          Know who's off. Know where you're short.
          <br />
        </h1>

        <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Coverboard helps care homes, pubs and restaurants, pharmacies and other shift-based teams manage leave, sickness and staff cover, so you see a gap before it becomes a problem.
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
    description: "See who's available and get warned before a request leaves you short.",
    preview: CoverPreview,
  },
];

// Mirrors the real cover-candidate rules: not on leave, not already on the
// shift, and 11 hours' rest either side (see src/lib/shiftCover.ts). Don't add
// "ask to cover", qualifications or hours here until the product has them.
const coverRows = [
  { name: "Sarah T.", note: "Zero-hours", free: true, reason: "Free" },
  { name: "Priya K.", note: "Bank", free: true, reason: "Free" },
  { name: "Tom R.", note: "Days until 20:00", free: false, reason: "Needs 11h rest" },
  { name: "Nia O.", note: "Part-time", free: false, reason: "On leave" },
];

const findCoverPoints = [
  {
    title: "See the gap, shift by shift",
    description:
      "Minimums are set per shift and per day of the week, so a short night shows up even when the day looks fine.",
  },
  {
    title: "See who's free to cover",
    description:
      "Bank, zero-hours and part-time staff who aren't working, aren't on leave and would still get 11 hours' rest.",
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
  "statutory leave & SSP",
  "payroll export",
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
            <div key={p.title} className="rounded-2xl border border-gray-100 bg-gray-50 p-5 md:p-6">
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
            Short on a shift? See who can step in.
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            When a shift drops below minimum, Coverboard shows you who could step in,
            so you&apos;re not scrolling through a rota at 6am.
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

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-hidden>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Thursday · Night</p>
              <p className="text-xs text-gray-500">Care staff · 20:00–08:00</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3 w-3" />
              1 person needed
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">1 of 2 available · Amara off sick</p>

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
                  <p className="text-xs text-gray-500">{r.note}</p>
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
            Cover arranged? Approve the request, and any override is recorded in the
            audit history.
          </div>
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
      <FindCoverSection />
      <HowItWorksSection />
      <PricingSection />
      <CTASection />
      <CountriesSection />
      <LandingFooter />
    </div>
  );
}
