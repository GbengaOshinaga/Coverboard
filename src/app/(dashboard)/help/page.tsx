"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LifeBuoy,
  Mail,
  Zap,
  Clock,
  CheckCircle2,
  ExternalLink,
  CalendarCheck,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  hasPrioritySupport,
  hasSlaSupport,
  hasDedicatedOnboarding,
  PLAN_LABELS,
  type SubscriptionPlan,
} from "@/lib/plans";

const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@coverboard.app";
const PRIORITY_EMAIL =
  process.env.NEXT_PUBLIC_PRIORITY_SUPPORT_EMAIL ?? "priority@coverboard.app";
const SLA_EMAIL =
  process.env.NEXT_PUBLIC_SLA_SUPPORT_EMAIL ?? "pro@coverboard.app";
const ONBOARDING_BOOKING_URL =
  process.env.NEXT_PUBLIC_ONBOARDING_BOOKING_URL ??
  "https://cal.com/coverboard/onboarding";

type OrgSettings = {
  plan?: SubscriptionPlan;
};

export default function HelpPage() {
  const [plan, setPlan] = useState<SubscriptionPlan | undefined>();

  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch("/api/organization/settings");
        if (res.ok) {
          const data = (await res.json()) as OrgSettings;
          setPlan(data.plan);
        }
      } catch {
        // ignore
      }
    }
    fetchPlan();
  }, []);

  const priority = hasPrioritySupport(plan);
  const sla = hasSlaSupport(plan);
  const dedicatedOnboarding = hasDedicatedOnboarding(plan);
  const planLabel = plan ? PLAN_LABELS[plan] : "—";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          Help &amp; support
        </h1>
        <p className="text-sm text-gray-500">
          Resources, documentation, and how to reach us
        </p>
      </div>

      {/* Plan card */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <LifeBuoy className="h-5 w-5 text-brand-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Your plan</p>
              <p className="text-xs text-gray-500">
                {sla
                  ? "SLA-backed support is included"
                  : priority
                    ? "Priority support is included"
                    : "Standard support is included"}
              </p>
            </div>
          </div>
          <Badge variant={priority ? "success" : "outline"}>{planLabel}</Badge>
        </CardContent>
      </Card>

      {/* Dedicated onboarding session (Pro) */}
      {dedicatedOnboarding && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-emerald-600" />
              Dedicated onboarding session
            </CardTitle>
            <CardDescription>
              Book a 60-minute session with a Coverboard specialist to tailor
              policies, integrations, and rollout to your organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              Your Pro plan includes one complimentary onboarding session plus
              follow-ups during your first 90 days.
            </p>
            <a
              href={ONBOARDING_BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm">Book your session</Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* Support panel — SLA (Pro) > Priority (Scale) > Standard */}
      {sla ? (
        <Card className="border-brand-300 bg-brand-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-brand-700" />
              SLA-backed support
            </CardTitle>
            <CardDescription>
              Dedicated account contact with contractual response times and
              24×7 critical-incident coverage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-brand-200 bg-white p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  Response target
                </div>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  Within 1 business hour
                </p>
              </div>
              <div className="rounded-lg border border-brand-200 bg-white p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Coverage
                </div>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  24×7 for P1 incidents
                </p>
              </div>
              <div className="rounded-lg border border-brand-200 bg-white p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <Mail className="h-3.5 w-3.5" />
                  Direct line
                </div>
                <a
                  href={`mailto:${SLA_EMAIL}`}
                  className="mt-1 block break-all text-sm font-semibold text-brand-700 hover:text-brand-800"
                >
                  {SLA_EMAIL}
                </a>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Your SLA includes 99.9% uptime, credit-back for breaches, and a
              named account contact.
            </p>
          </CardContent>
        </Card>
      ) : priority ? (
        <Card className="border-brand-200 bg-brand-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-brand-600" />
              Priority support
            </CardTitle>
            <CardDescription>
              Faster response times, dedicated routing, and direct access to
              senior support engineers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-brand-200 bg-white p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  Response target
                </div>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  Within 4 business hours
                </p>
              </div>
              <div className="rounded-lg border border-brand-200 bg-white p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Coverage
                </div>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  Mon–Fri, 9am–6pm GMT
                </p>
              </div>
              <div className="rounded-lg border border-brand-200 bg-white p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <Mail className="h-3.5 w-3.5" />
                  Direct line
                </div>
                <a
                  href={`mailto:${PRIORITY_EMAIL}`}
                  className="mt-1 block break-all text-sm font-semibold text-brand-700 hover:text-brand-800"
                >
                  {PRIORITY_EMAIL}
                </a>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Include your organization name and a description of the issue —
              we&rsquo;ll route it straight to a senior engineer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-gray-500" />
              Standard support
            </CardTitle>
            <CardDescription>
              We typically reply within 1 business day. Upgrade to Scale for
              priority support, or Pro for a 1-hour SLA.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {SUPPORT_EMAIL}
            </a>
          </CardContent>
        </Card>
      )}

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
          <CardDescription>Guides and references</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="https://www.gov.uk/holiday-entitlement-rights"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700"
              >
                UK statutory holiday entitlement (gov.uk)
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <a
                href="https://www.gov.uk/employers-sick-pay"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700"
              >
                Statutory Sick Pay employer guide (gov.uk)
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <a
                href="https://www.gov.uk/maternity-pay-leave"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700"
              >
                Statutory Maternity Pay &amp; Leave (gov.uk)
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <a
                href="https://www.gov.uk/check-job-applicant-right-to-work"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700"
              >
                Right to work checks (gov.uk)
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
