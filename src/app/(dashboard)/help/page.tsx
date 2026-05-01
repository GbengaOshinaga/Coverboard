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
  BadgeCheck,
} from "lucide-react";
import {
  hasPrioritySupport,
  hasSlaSupport,
  PLAN_LABELS,
  type AnyPlan,
} from "@/lib/plans";

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hello@coverboard.app";
const PRIORITY_EMAIL =
  process.env.NEXT_PUBLIC_PRIORITY_SUPPORT_EMAIL ?? "priority@coverboard.app";
const SLA_EMAIL =
  process.env.NEXT_PUBLIC_SLA_SUPPORT_EMAIL ?? "pro@coverboard.app";

type OrgSettings = {
  plan?: AnyPlan;
};

export default function HelpPage() {
  const [plan, setPlan] = useState<AnyPlan | undefined>();

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
  const planLabel = plan
    ? plan === "TRIAL"
      ? "Trial"
      : plan === "LOCKED"
        ? "Locked"
        : PLAN_LABELS[plan]
    : "—";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          Help &amp; contact
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
                  ? "1-hour response target is included"
                  : priority
                    ? "Priority response is included"
                    : "Standard response is included"}
              </p>
            </div>
          </div>
          <Badge variant={priority ? "success" : "outline"}>{planLabel}</Badge>
        </CardContent>
      </Card>

      {/* Contact panel — SLA (Pro) > Priority (Scale) > Standard */}
      {sla ? (
        <Card className="border-brand-300 bg-brand-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-brand-700" />
              SLA-backed response
            </CardTitle>
            <CardDescription>
              Direct contact channel with agreed response targets and 24×7
              critical-incident coverage.
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
              We target 99.9% uptime. This is an availability objective, not a
              guarantee. Formal SLA terms and remedies apply only where agreed
              in writing.
            </p>
          </CardContent>
        </Card>
      ) : priority ? (
        <Card className="border-brand-200 bg-brand-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-brand-600" />
              Priority response
            </CardTitle>
            <CardDescription>
              Faster response times and a dedicated route for urgent product
              questions.
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
              it will be prioritized for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-gray-500" />
              Standard contact
            </CardTitle>
            <CardDescription>
              Replies typically arrive within 1 business day. Upgrade to Scale
              for priority response, or Pro for a 1-hour SLA.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {CONTACT_EMAIL}
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
