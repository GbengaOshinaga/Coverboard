/**
 * Pricing tiers shown on the marketing pages and signup form.
 *
 * Feature lists here are MARKETING COPY — they describe the post-launch
 * intent. Several features (scheduled reports, custom policy builder,
 * leave operations dashboard, multi-format export) are not yet built.
 * They will land before public launch; runtime feature gates in
 * `planFeatures.ts` only cover features actually wired into the codebase
 * today.
 *
 * Headcount caps and admin caps live in `src/lib/plans.ts`
 * (PLAN_MAX_EMPLOYEES, PLAN_DEFAULT_MAX_ADMINS) and are enforced server-
 * side. Keep the human-readable copy here in sync with those numbers.
 */
export type PricingTier = {
  /** Display name. Matches the `PLAN_LABELS` value in `plans.ts`. */
  name: string;
  tagline: string;
  /** GBP per month. £0 = free tier; no Stripe subscription is created. */
  price_monthly: number;
  /** Human-readable headcount note: "Up to 5 employees" or "Unlimited". */
  headcount: string;
  cta: string;
  highlighted: boolean;
  badge?: string;
  features: string[];
};

export type PricingConfig = {
  currency: string;
  tiers: PricingTier[];
};

export const PRICING: PricingConfig = {
  currency: "£",
  tiers: [
    {
      name: "Free",
      tagline: "Try Coverboard for your small team",
      price_monthly: 0,
      headcount: "Up to 5 employees",
      cta: "Start free",
      highlighted: false,
      features: [
        "Annual leave tracking",
        "Team calendar",
        "Leave requests & approvals",
        "Email notifications",
        "1 admin user",
      ],
    },
    {
      name: "Starter",
      tagline: "For growing UK teams",
      price_monthly: 19,
      headcount: "Up to 15 employees",
      cta: "Start free trial",
      highlighted: false,
      features: [
        "Everything in Free",
        "Pro-rata for part-time",
        "Custom carry-over rules",
        "Bank holiday region config",
        "Up to 2 admin users",
      ],
    },
    {
      name: "Growth",
      tagline: "Stay compliant",
      price_monthly: 49,
      headcount: "Unlimited employees",
      cta: "Start free trial",
      highlighted: true,
      badge: "Most popular",
      features: [
        "Everything in Starter",
        "All UK statutory leave types",
        "SSP tracking + fit note alerts",
        "SMP / paternity / SPL tracker",
        "Bradford Factor reporting",
        "Pro-rata for all contract types",
        "Right to work tracking",
        "Up to 5 admin users",
      ],
    },
    {
      name: "Scale",
      tagline: "Understand your workforce",
      price_monthly: 99,
      headcount: "Unlimited employees",
      cta: "Start free trial",
      highlighted: false,
      features: [
        "Everything in Growth",
        "Absence trend analysis",
        "Regional cover analytics",
        "Custom leave policy builder",
        "Scheduled report delivery (email)",
        "Data export in multiple formats",
        "Leave operations dashboard",
        "Unlimited admin users",
      ],
    },
    {
      name: "Pro",
      tagline: "Enterprise-ready",
      price_monthly: 179,
      headcount: "Unlimited employees",
      cta: "Start free trial",
      highlighted: false,
      features: [
        "Everything in Scale",
        "Full API access",
        "Audit log + SAR exports",
        "GDPR data residency config",
        "Custom leave policies",
        "Onboarding call",
      ],
    },
  ],
};
