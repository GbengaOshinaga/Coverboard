/**
 * Registry of public, no-auth marketing tools served under /tools. Listed here
 * once so the /tools index and the sitemap stay in sync — add a tool by adding
 * a row (and its route under src/app/tools/<slug>/).
 */
export type ToolMeta = {
  slug: string;
  title: string;
  description: string;
};

export const TOOLS: ToolMeta[] = [
  {
    slug: "ssp-calculator",
    title: "Statutory Sick Pay (SSP) calculator",
    description:
      "Work out UK Statutory Sick Pay under the 2026 rules — no waiting days, no Lower Earnings Limit, capped at 80% of average weekly earnings.",
  },
  {
    slug: "irregular-hours-holiday-calculator",
    title: "Irregular hours & zero-hours holiday calculator",
    description:
      "Work out holiday entitlement for irregular-hours, zero-hours and part-year workers using the UK statutory 12.07% accrual method.",
  },
];
