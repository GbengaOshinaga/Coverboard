import { prisma } from "@/lib/prisma";
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
