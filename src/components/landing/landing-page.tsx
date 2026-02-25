import Link from "next/link";
import {
  CalendarDays,
  Users,
  Globe,
  Bell,
  ShieldCheck,
  BarChart3,
  Check,
  ArrowRight,
  MessageSquare,
  Zap,
} from "lucide-react";
import { LandingNavbar } from "./navbar";

function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/60 to-white" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-100/40 blur-3xl -z-10" />

      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-4 py-1.5 text-sm text-brand-700 mb-8">
          <Zap size={14} />
          Built for small, distributed teams
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
          Know who&apos;s out.
          <br />
          <span className="text-brand-600">Plan who&apos;s covered.</span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Coverboard is the dead-simple leave management tool for teams of 5&ndash;50.
          Country-specific rules, overlap detection, and a single &ldquo;Who&apos;s out today?&rdquo;
          view &mdash; without the BambooHR price tag.
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

        <p className="mt-5 text-sm text-gray-400">
          Free for up to 10 team members &middot; No credit card required
        </p>
      </div>

      {/* Dashboard Preview */}
      <div className="mt-16 mx-auto max-w-5xl px-6">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-200/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="ml-3 text-xs text-gray-400">coverboard.app/dashboard</span>
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
    icon: CalendarDays,
    title: "Who's out today?",
    description:
      "One glance shows you every absence across the team. No more Slack-pinging to find out who's off.",
  },
  {
    icon: Globe,
    title: "Multi-country leave rules",
    description:
      "Statutory allowances and public holidays for Nigeria, Kenya, South Africa, Ghana, Brazil, Mexico, Philippines, Indonesia — and growing.",
  },
  {
    icon: Users,
    title: "Overlap detection",
    description:
      "See who else is off before you approve. Never accidentally leave a project unstaffed.",
  },
  {
    icon: BarChart3,
    title: "Leave balance tracking",
    description:
      "Real-time balances that account for country policies, approved requests, and pending days off.",
  },
  {
    icon: MessageSquare,
    title: "Slack integration",
    description:
      "Use /whosout, /mybalance, and /requestleave right from Slack. Approve requests with one click.",
  },
  {
    icon: Bell,
    title: "Email notifications",
    description:
      "Managers get notified of new requests. Team members get instant updates when their leave is approved or rejected.",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-brand-600 mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Everything a small team needs. Nothing it doesn&apos;t.
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            Built for the way distributed teams actually work &mdash; across countries, time zones, and tools.
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
      "Add team members by email. They get an invite with login credentials and are ready to request leave immediately.",
  },
  {
    step: "3",
    title: "See who's out, approve in seconds",
    description:
      "Your dashboard shows absences at a glance. Review and approve requests from the web app, email, or Slack.",
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

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For small teams getting started",
    features: [
      "Up to 10 team members",
      "Unlimited leave requests",
      "Multi-country leave rules",
      "Who's out today dashboard",
      "Email notifications",
      "Public holiday calendars",
    ],
    cta: "Get started free",
    ctaStyle: "border-2 border-brand-600 text-brand-600 hover:bg-brand-50",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$4",
    period: "per user / month",
    description: "For growing teams that need more",
    features: [
      "Everything in Free",
      "Unlimited team members",
      "Slack integration",
      "Overlap & coverage warnings",
      "Jira project coverage",
      "Priority support",
    ],
    cta: "Start 14-day trial",
    ctaStyle: "bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-600/20",
    highlight: true,
  },
];

function PricingSection() {
  return (
    <section id="pricing" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-brand-600 mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Simple pricing for simple teams
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            Start free, upgrade when you need to. No hidden fees.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-8 flex flex-col ${
                plan.highlight
                  ? "border-brand-200 shadow-xl shadow-brand-100/40 ring-1 ring-brand-100 relative"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-3">
                  <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500 text-sm">/ {plan.period}</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-700">
                    <Check size={16} className="text-brand-600 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`block text-center font-semibold py-3 rounded-xl transition-colors ${plan.ctaStyle}`}
              >
                {plan.cta}
              </Link>
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
          Join teams across Africa, LATAM, and Southeast Asia who use Coverboard to
          manage leave without the spreadsheet chaos.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors hover:bg-brand-50 shadow-lg"
          >
            Get started free <ArrowRight size={18} />
          </Link>
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
              Team leave management for distributed teams. Know who&apos;s out, plan coverage, stay sane.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-12 text-sm">
            <div>
              <p className="font-semibold text-white mb-3">Product</p>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
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
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Coverboard. All rights reserved.
        </div>
      </div>
    </footer>
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
      <CTASection />
      <Footer />
    </div>
  );
}
