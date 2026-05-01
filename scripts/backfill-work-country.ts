import { prisma } from "@/lib/prisma";

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true },
  });

  let updated = 0;

  for (const org of orgs) {
    const users = await prisma.user.findMany({
      where: { organizationId: org.id },
      select: { id: true, role: true, countryCode: true, workCountry: true },
    });

    const admins = users.filter((u) => u.role === "ADMIN");
    const fallbackCountry =
      admins[0]?.countryCode ??
      users.find((u) => Boolean(u.countryCode))?.countryCode ??
      null;

    // Best-effort backfill:
    // - if we can infer a company-level country, use it
    // - otherwise leave as NULL so admins can review manually
    if (!fallbackCountry) continue;

    const targets = users.filter((u) => u.workCountry === null);
    if (targets.length === 0) continue;

    await prisma.user.updateMany({
      where: { id: { in: targets.map((u) => u.id) } },
      data: { workCountry: fallbackCountry },
    });
    updated += targets.length;
  }

  console.log(`Backfill complete. Updated ${updated} users.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
