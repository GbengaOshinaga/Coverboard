export type PricingTier = {
  name: string;
  tagline: string;
  price_monthly: number;
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
      name: "Starter",
      tagline: "Core leave management",
      price_monthly: 19,
      cta: "Start free trial",
      highlighted: false,
      features: [
        "All UK statutory leave types",
        "Employee self-service portal",
        "Team calendar",
        "Leave requests & approvals",
        "Email notifications",
        "Up to 2 admin users",
      ],
    },
    {
      name: "Growth",
      tagline: "Compliance & reporting",
      price_monthly: 49,
      cta: "Start free trial",
      highlighted: true,
      badge: "Most popular",
      features: [
        "Everything in Starter",
        "Bradford Factor reporting",
        "Pro-rata for part-time & zero-hours",
        "Bank holiday region config",
        "Right to work tracking",
        "SSP & fit note tracking",
        "Unlimited admin users",
      ],
    },
    {
      name: "Scale",
      tagline: "Advanced HR operations",
      price_monthly: 99,
      cta: "Start free trial",
      highlighted: false,
      features: [
        "Everything in Growth",
        "Parental leave tracker",
        "KIT & SPLIT day tracking",
        "Holiday pay earnings history",
        "52-week average pay calculation",
        "Custom carry-over rules",
        "Absence analytics dashboard",
        "UK compliance report pack",
        "Priority response",
      ],
    },
    {
      name: "Pro",
      tagline: "Enterprise-ready",
      price_monthly: 179,
      cta: "Start free trial",
      highlighted: false,
      features: [
        "Everything in Scale",
        "Custom leave policies",
        "GDPR data residency config",
        "Audit trail exports",
        "Priority email response",
      ],
    },
  ],
};
