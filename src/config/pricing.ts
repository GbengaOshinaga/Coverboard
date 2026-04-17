export type PricingTier = {
  name: string;
  price_monthly: number;
  price_annual_monthly: number;
  employees: string;
  cta: string;
  highlighted: boolean;
  badge?: string;
  features: string[];
};

export type PricingConfig = {
  currency: string;
  billingNote: string;
  tiers: PricingTier[];
};

export const PRICING: PricingConfig = {
  currency: "£",
  billingNote: "Save 2 months with annual billing",
  tiers: [
    {
      name: "Starter",
      price_monthly: 19,
      price_annual_monthly: 16,
      employees: "Up to 15 employees",
      cta: "Start free trial",
      highlighted: false,
      features: [
        "All core leave types (UK statutory)",
        "Employee self-service portal",
        "Team calendar",
        "Email notifications",
        "Up to 2 admin users",
      ],
    },
    {
      name: "Growth",
      price_monthly: 49,
      price_annual_monthly: 41,
      employees: "16–50 employees",
      cta: "Start free trial",
      highlighted: true,
      badge: "Most popular",
      features: [
        "Everything in Starter",
        "Bradford Factor reporting",
        "Pro-rata for part-time & zero-hours",
        "Bank holiday region config",
        "Right to work tracking",
        "Unlimited admin users",
      ],
    },
    {
      name: "Scale",
      price_monthly: 99,
      price_annual_monthly: 82,
      employees: "51–150 employees",
      cta: "Start free trial",
      highlighted: false,
      features: [
        "Everything in Growth",
        "SSP & parental leave tracker",
        "Custom carry-over rules",
        "Absence analytics dashboard",
        "Priority support",
        "UK compliance report pack",
      ],
    },
    {
      name: "Pro",
      price_monthly: 179,
      price_annual_monthly: 149,
      employees: "151–300 employees",
      cta: "Book a demo",
      highlighted: false,
      features: [
        "Everything in Scale",
        "Dedicated onboarding session",
        "Custom leave policies",
        // "API access",
        "SLA-backed support",
        "Audit trail exports",
      ],
    },
  ],
};
