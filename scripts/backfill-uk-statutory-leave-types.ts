import { prisma } from "@/lib/prisma";
import { enableUkStatutoryLeaveTypes } from "@/lib/uk-statutory";

/**
 * Re-seed UK statutory leave types for existing organisations. New leave types
 * added to the GB policy block (e.g. Carer's Leave, Neonatal Care Leave) only
 * reach NEW orgs automatically; existing orgs already passed the
 * `hasUkStatutoryLeaveTypes` guard, so this backfill upserts the full current
 * set for any org that already has UK statutory types or GB-based employees.
 *
 * `enableUkStatutoryLeaveTypes` is idempotent (upserts per leave type + policy
 * + bank holidays), so running this repeatedly is safe.
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
    await enableUkStatutoryLeaveTypes(org.id);
    updated += 1;
    console.log(`  re-seeded UK statutory leave types for ${org.name}`);
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
