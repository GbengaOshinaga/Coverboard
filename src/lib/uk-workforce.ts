import { prisma } from "@/lib/prisma";

export const NO_UK_EMPLOYEES_ERROR = "NO_UK_EMPLOYEES";

export function ukComplianceUnavailablePayload() {
  return {
    error: NO_UK_EMPLOYEES_ERROR,
    message:
      "UK compliance reports are only available for companies with UK-based employees. Add a UK work location to an employee profile to enable these reports.",
  };
}

export function filterToUkEmployees<T extends { workCountry: string | null }>(
  employees: T[]
): T[] {
  return employees.filter((employee) => employee.workCountry === "GB");
}

export async function hasUKEmployees(organizationId: string): Promise<boolean> {
  const result = await prisma.user.findFirst({
    where: {
      organizationId,
      workCountry: "GB",
      isActive: true,
    },
    select: { id: true },
  });
  return Boolean(result);
}

export async function getUKWorkforceCounts(organizationId: string): Promise<{
  uk: number;
  total: number;
}> {
  const [uk, total] = await Promise.all([
    prisma.user.count({
      where: { organizationId, workCountry: "GB", isActive: true },
    }),
    prisma.user.count({
      where: { organizationId, isActive: true },
    }),
  ]);

  return { uk, total };
}
