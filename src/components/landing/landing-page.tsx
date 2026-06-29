"use client";

import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Globe,
  ShieldCheck,
  BarChart3,
  Check,
  ArrowRight,
  MessageSquare,
  Building2,
} from "lucide-react";
import { LandingNavbar } from "./navbar";
import { PricingSection } from "./pricing-section";

function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/60 to-white" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-100/40 blur-3xl -z-10" />

      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-3 py-1.5 text-sm text-brand-700 mb-8">
          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
            New
          </span>
          For UK shift, hourly &amp; zero-hours teams
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
          Leave &amp; cover that gets
          <br />
          <span className="text-brand-600">shift work right.</span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Most leave tools break the moment your staff don&apos;t work fixed
          days. Coverboard gets holiday and sick pay right for variable-hours,
          zero-hours and part-time workers &mdash; the maths employers get sued
          for &mdash; warns you before a team drops below cover, and runs
          month-to-month with no contract.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors shadow-lg shadow-brand-600/20"
          >
            Start free <ArrowRight size={18} />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium px-6 py-3.5 text-base transition-colors"
          >
            See how it works
          </a>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          Running HR, payroll handoffs, or compliance reviews?{" "}
          <a
            href="#scale-pro"
            className="font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
          >
            See Scale &amp; Pro
          </a>
        </p>

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
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Out today", value: "2", color: "text-orange-600 bg-orange-50" },
                { label: "Pending requests", value: "3", color: "text-brand-600 bg-brand-50" },
                { label: "Team members", value: "12", color: "text-emerald-600 bg-emerald-50" },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm opacity-70 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-100 p-4">
                <p className="font-semibold text-gray-900 text-sm mb-3">Who&apos;s out today</p>
                {[
                  { name: "Amara O.", type: "Annual Leave", color: "bg-blue-400" },
                  { name: "Diego R.", type: "Sick Leave", color: "bg-amber-400" },
                ].map((p) => (
                  <div key={p.name} className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                      {p.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${p.color}`} />
                        <p className="text-xs text-gray-500">{p.type}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-gray-100 p-4">
                <p className="font-semibold text-gray-900 text-sm mb-3">Upcoming this week</p>
                {[
                  { name: "Fatima K.", dates: "Wed 19 — Fri 21", type: "Annual Leave" },
                  { name: "Carlos M.", dates: "Thu 20", type: "Personal Day" },
                ].map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.type}</p>
                    </div>
                    <span className="text-xs text-gray-400">{p.dates}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Clock,
    title: "Variable-hours holiday, done right",
    description:
      "Holiday for zero-hours and irregular-hours staff accrues at the correct 12.07% of hours worked — tracked and taken in hours, not fudged into days. The maths the simple tools can't do and employers get sued for, built in.",
  },
  {
    icon: ShieldCheck,
    title: "Never drop below cover",
    description:
      "Set a minimum cover level per team, region or role. Coverboard warns you the moment a request would leave a shift short-staffed — before you approve it, not after.",
  },
  {
    icon: Check,
    title: "Statutory sick & family pay, current with the law",
    description:
      "SSP on the 2026 rules (no waiting days, 80% of earnings), SMP eligibility, holiday-pay averaging, carer's and neonatal care leave, Bradford Factor and bank holidays by region — kept up to date so you stay compliant without thinking about it.",
  },
  {
    icon: CalendarDays,
    title: "Who's off — and where you're short",
    description:
      "One glance shows who's out today, who's back soon, and which teams are below safe cover this week. No more group-chat scramble to find out.",
  },
  {
    icon: Building2,
    title: "No contract, no sales calls",
    description:
      "Self-serve and month-to-month — start free, cancel anytime. No multi-year lock-in, no 80% cancellation penalties, no 'free advice' sessions that are really sales pitches.",
  },
  {
    icon: BarChart3,
    title: "Reports built for shift teams",
    description:
      "Absence trends, Bradford Factor, regional cover, holiday-usage and a payroll export — the reporting the simple trackers don't give you.",
  },
  {
    icon: MessageSquare,
    title: "Slack & integrations",
    description:
      "Run /whosout, /mybalance and /requestleave from Slack, with email approvals and notifications so nothing gets missed.",
  },
];

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
          </div>

          <div className="rounded-2xl border border-brand-200 bg-white p-6 md:p-8 shadow-md shadow-brand-100/30 ring-1 ring-brand-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Pro
            </p>
            <p className="mt-1 text-sm text-gray-500">Enterprise-ready</p>
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

function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-brand-600 mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Made for teams the simple tools can&apos;t handle
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            Variable hours, zero-hours contracts, shift cover, statutory pay that
            has to be right — the stuff that breaks simple trackers and lands
            employers in tribunals. Coverboard handles it, without a contract.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-gray-100 p-6 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-50 transition-all">
              <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                <f.icon size={22} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    step: "1",
    title: "Sign up & pick your countries",
    description:
      "Create your org in 30 seconds. Select the countries your team operates in — we auto-apply the right leave rules and public holidays.",
  },
  {
    step: "2",
    title: "Invite your team",
    description:
      "Add team members one at a time or bulk-import a CSV. Everyone gets an invite email with login credentials and can start requesting leave immediately.",
  },
  {
    step: "3",
    title: "The spreadsheet becomes unnecessary",
    description:
      "The first request gets approved, the balance updates in real time, and the calendar reflects it instantly — no chasing, no manual updates, no one texting their manager to ask how many days they have left.",
  },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-gray-50">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-brand-600 mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Up and running in under 2 minutes
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.step} className="relative">
              <div className="w-10 h-10 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-sm mb-5">
                {s.step}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{s.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
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
          Stop guessing who&apos;s available
        </h2>
        <p className="mt-4 text-lg text-brand-100 max-w-xl mx-auto">
          Whether you&apos;re running a 10-person team in Lagos, a healthcare
          agency in London, or a team spread across several countries —
          Coverboard handles each country&apos;s leave rules so you don&apos;t
          have to.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors hover:bg-brand-50 shadow-lg"
          >
            Get started free <ArrowRight size={18} />
          </Link>
          <a
            href="#scale-pro"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-white/40 bg-transparent px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            Scale &amp; Pro overview
          </a>
        </div>
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
  { flag: "🇬🇧", name: "United Kingdom" },
  { flag: "🇳🇬", name: "Nigeria" },
  { flag: "🇰🇪", name: "Kenya" },
  { flag: "🇿🇦", name: "South Africa" },
  { flag: "🇬🇭", name: "Ghana" },
  { flag: "🇧🇷", name: "Brazil" },
  { flag: "🇲🇽", name: "Mexico" },
  { flag: "🇵🇭", name: "Philippines" },
  { flag: "🇮🇩", name: "Indonesia" },
];

function CountriesSection() {
  return (
    <section className="py-20 md:py-28 bg-white border-t border-gray-100">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="text-sm font-semibold text-brand-600 mb-3">
          Built for your country
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
          Leave rules for 9 countries and growing
        </h2>
        <p className="mt-4 text-gray-600 text-lg">
          Pick the countries your team works in — Coverboard applies each one&apos;s
          leave entitlements and public holidays automatically, not bolted on.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {COUNTRIES.map((c) => (
            <span
              key={c.name}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700"
            >
              <span aria-hidden className="text-base">{c.flag}</span>
              {c.name}
            </span>
          ))}
        </div>

        <p className="mt-8 text-sm text-gray-500">
          Plus deep UK statutory compliance — SSP, SMP, Bradford Factor,
          right-to-work and more.{" "}
          <a
            href="#features"
            className="font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
          >
            See the UK depth
          </a>
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
      <CountriesSection />
      <ScaleAndProSection />
      <HowItWorksSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
