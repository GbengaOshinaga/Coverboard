/**
 * Creates the four Coverboard subscription products + prices in Stripe.
 *
 * Run once per Stripe account (dev + live are separate accounts):
 *   npx tsx scripts/createStripeProducts.ts
 *
 * Idempotency: looks up products by name and re-uses them; creates new prices
 * only if the existing price does not already match unit_amount + currency.
 * After running, paste the four `price_...` IDs into src/config/stripePrices.ts.
 */
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required in .env.local");
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" });

type TierSeed = {
  key: "starter" | "growth" | "scale" | "pro";
  name: string;
  unitAmount: number;
};

const TIERS: TierSeed[] = [
  { key: "starter", name: "Coverboard Starter", unitAmount: 1900 },
  { key: "growth", name: "Coverboard Growth", unitAmount: 4900 },
  { key: "scale", name: "Coverboard Scale", unitAmount: 9900 },
  { key: "pro", name: "Coverboard Pro", unitAmount: 17900 },
];

async function findOrCreateProduct(name: string): Promise<Stripe.Product> {
  const existing = await stripe.products.search({
    query: `name:"${name}" AND active:"true"`,
  });
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({ name, active: true });
}

async function findOrCreatePrice(
  productId: string,
  unitAmount: number
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });
  const match = existing.data.find(
    (p) =>
      p.unit_amount === unitAmount &&
      p.currency === "gbp" &&
      p.recurring?.interval === "month"
  );
  if (match) return match;
  return stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: "gbp",
    recurring: { interval: "month" },
  });
}

async function main() {
  const results: Record<string, string> = {};
  for (const tier of TIERS) {
    const product = await findOrCreateProduct(tier.name);
    const price = await findOrCreatePrice(product.id, tier.unitAmount);
    results[tier.key] = price.id;
    console.log(
      `${tier.name.padEnd(22)} product=${product.id} price=${price.id} (£${
        tier.unitAmount / 100
      }/mo)`
    );
  }

  console.log("\nPaste into src/config/stripePrices.ts:");
  console.log("export const STRIPE_PRICE_IDS = {");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: "${v}",`);
  }
  console.log("} as const;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
