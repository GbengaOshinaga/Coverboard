import { prisma } from "@/lib/prisma";

/**
 * Leave type names are unique per team regardless of case: rules recognise
 * types by name ("Unpaid parental…"), so "annual leave" beside "Annual Leave"
 * would be confusing. Returns the clash message, or null.
 */
export async function leaveTypeNameTaken(
  organizationId: string,
  name: string,
  exceptId?: string
): Promise<string | null> {
  const clash = await prisma.leaveType.findFirst({
    where: {
      organizationId,
      name: { equals: name.trim(), mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  return clash ? `A leave type called "${clash.name}" already exists.` : null;
}
