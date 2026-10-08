import { prisma } from "@/lib/prisma";

/** The form names are compared in: spaces trimmed and collapsed, any case. */
export const leaveTypeNameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Leave type names are unique per team regardless of case and spacing: rules
 * recognise types by name ("Unpaid parental…"), so "annual leave" beside
 * "Annual Leave" or "Training " beside "Training" would be confusing.
 * Compared in code, not SQL, so names saved with stray spaces before names
 * were trimmed still count. Returns the clash message, or null.
 */
export async function leaveTypeNameTaken(
  organizationId: string,
  name: string,
  exceptId?: string
): Promise<string | null> {
  const types = await prisma.leaveType.findMany({
    where: { organizationId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  const key = leaveTypeNameKey(name);
  const clash = types.find((t) => leaveTypeNameKey(t.name) === key);
  return clash ? `A leave type called "${clash.name.trim()}" already exists.` : null;
}
