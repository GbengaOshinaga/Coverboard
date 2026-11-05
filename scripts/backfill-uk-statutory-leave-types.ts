import { prisma } from "@/lib/prisma";
import { enableUkStatutoryLeaveTypes } from "@/lib/uk-statutory";

/**
 * Adds UK leave types that are missing for existing organisations. New types
 * added to the GB list (Carer's Leave, Neonatal Care Leave, Trade Union
 * Duties and Activities) only reach NEW orgs automatically, so this adds them
 * for any org that already has UK statutory types or GB-based employees.
 *
 * Only adds what's missing: types a team already has, and their allowances,
 * are left as the team set them. Safe to run repeatedly.
 *
 * Run once after deploy:  npx tsx scripts/backfill-uk-statutory-leave-types.ts
 */
async function main() {
  // Orgs with any GB statutory leave type already, OR any GB-based employee.
  const orgs = await prisma.organization.findMany({
    where: {
      OR: [
        { leaveTypes: { some: { countryCode: "GB" } } },
        { users: { some: { workCountry: "GB" } } },
      ],
    },
    select: { id: true, name: true },
  });

  let updated = 0;
  for (const org of orgs) {
    await enableUkStatutoryLeaveTypes(org.id, { onlyAddMissing: true });
    updated += 1;
    console.log(`  added any missing UK leave types for ${org.name}`);
  }

  console.log(`Backfill complete. Processed ${updated} UK organisation(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
