import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { PLAN_DISPLAY_NAME, PLAN_KEY_TO_ENUM, planKeyFromPriceId } from "@/config/stripePrices";
import { maxAdminsForPlan, maxEmployeesForPlan, type AnyPlan } from "@/lib/plans";

/**
 * Why a team can't move to a plan: more active staff or admins than it
 * allows (e.g. a 90-person trial choosing Growth, capped at 75). Null when
 * they fit. Same counts as adding someone (active people only).
 */
export async function headcountOverPlanError(organizationId: string, plan: AnyPlan, planName: string): Promise<string | null> {
  const [employees, admins] = await Promise.all([
    prisma.user.count({ where: { organizationId, isActive: true } }),
    prisma.user.count({ where: { organizationId, role: "ADMIN", isActive: true } }),
  ]);
  const maxEmployees = maxEmployeesForPlan(plan);
  if (employees > maxEmployees) {
    return `${planName} is for up to ${maxEmployees} people and your team has ${employees}. Choose a bigger plan, or mark people who've left first.`;
  }
  const maxAdmins = maxAdminsForPlan(plan);
  if (admins > maxAdmins) {
    return `${planName} allows ${maxAdmins} admin${maxAdmins === 1 ? "" : "s"} and your team has ${admins}. Change some admins to managers first.`;
  }
  return null;
}

/**
 * The plan whose limits apply when adding people or admins, and how to name
 * it in a message ("Your plan allows up to…"). Usually the current plan, but
 * when the team is about to move plan it's the one they're moving to, so
 * they can't grow past it in the meantime: a trial that has chosen Growth
 * becomes Growth when it ends, and a downgrade to Free takes effect at the
 * end of the paid period. Both happen in Stripe's webhook, after payment,
 * where the move can't be refused.
 */
export async function planForLimits(
  organizationId: string,
  options: { askStripe?: boolean } = {}
): Promise<{ plan: AnyPlan; label: string } | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      stripePriceId: true,
      stripeSubscriptionId: true,
      cancelAtPeriodEnd: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
    },
  });
  if (!org) return null;

  if (org.plan === "TRIAL" && org.stripePriceId) {
    const key = planKeyFromPriceId(org.stripePriceId);
    if (key) {
      const when = org.trialEndsAt ? ` on ${format(org.trialEndsAt, "d MMM")}` : "";
      return { plan: PLAN_KEY_TO_ENUM[key], label: `${PLAN_DISPLAY_NAME[key]}, your plan when the trial ends${when},` };
    }
  }

  if (
    options.askStripe !== false &&
    org.cancelAtPeriodEnd &&
    org.stripeSubscriptionId &&
    (await downgradingToFree(org.stripeSubscriptionId))
  ) {
    const when = org.currentPeriodEnd ? ` from ${format(org.currentPeriodEnd, "d MMM")}` : "";
    return { plan: "FREE", label: `Free, your plan${when},` };
  }

  return { plan: org.plan, label: "Your plan" };
}

/**
 * Whether a subscription ending at period end is a downgrade to Free (set by
 * /api/billing/downgrade-to-free) rather than a plain cancellation. If Stripe
 * can't say, assume Free: the team is leaving its paid plan either way.
 */
async function downgradingToFree(subscriptionId: string): Promise<boolean> {
  if (!stripe) return true;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return (sub.metadata?.downgrade_target ?? "").toLowerCase() === "free";
  } catch {
    return true;
  }
}

/**
 * Whether a team is bigger than the plan it's paying for: a trial that has
 * converted onto a plan it outgrew, say. Its admins are sent to Billing until
 * it fits (middleware, from the session's overPlan). Trials and locked teams
 * are never over: a trial has no limit until it ends, and a locked team has
 * no plan.
 */
export async function overCurrentPlan(organizationId: string, plan: AnyPlan): Promise<boolean> {
  if (plan === "TRIAL" || plan === "LOCKED") return false;
  return (await headcountOverPlanError(organizationId, plan, "")) !== null;
}

/**
 * The banner's warning for admins: the team doesn't fit its plan, or the plan
 * its trial moves to. Without asking Stripe (it runs on every page), so a
 * pending downgrade to Free isn't covered; that's refused when it's asked for.
 */
export async function planLimitWarning(organizationId: string): Promise<string | null> {
  const limits = await planForLimits(organizationId, { askStripe: false });
  if (!limits || limits.plan === "LOCKED") return null;
  return headcountOverPlanError(organizationId, limits.plan, limits.label);
}
