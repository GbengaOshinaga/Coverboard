import { prisma } from "@/lib/prisma";
import { computeSspForSpell, recomputeAllSspSpells } from "@/lib/leave-requests/ssp-spell";

/**
 * Recalculates SSP on every live SSP absence: payable days on each person's
 * working week as it was when the absence started, the 28-week cap across
 * linked absences, and the HMRC daily rate (stored from 5 Oct 2026; absences
 * booked before then have none).
 *
 *   npm run recalculate:ssp            # dry run: lists what would change
 *   npm run recalculate:ssp -- --apply # writes the changes
 *
 * The dry run works each absence out against the stored figures for earlier
 * ones; when an earlier absence changes too, --apply (which goes oldest
 * first) can differ slightly for later linked absences.
 */
async function main() {
  const apply = process.argv.includes("--apply");

  const spells = await prisma.leaveRequest.findMany({
    where: {
      leaveType: { name: { contains: "SSP" } },
      status: { notIn: ["REJECTED", "CANCELLED"] },
    },
    orderBy: [{ userId: "asc" }, { startDate: "asc" }],
    select: {
      id: true,
      userId: true,
      startDate: true,
      endDate: true,
      sspDaysPaid: true,
      sspDailyRate: true,
      sspAverageWeeklyEarnings: true,
      user: { select: { name: true } },
    },
  });

  let changes = 0;
  for (const spell of spells) {
    const ssp = await computeSspForSpell({
      userId: spell.userId,
      startDate: spell.startDate,
      endDate: spell.endDate,
    });
    if (!ssp) continue;
    const oldRate = spell.sspDailyRate === null ? null : Number(spell.sspDailyRate);
    const oldAwe = spell.sspAverageWeeklyEarnings === null ? null : Number(spell.sspAverageWeeklyEarnings);
    if (
      ssp.sspDaysPaid === spell.sspDaysPaid &&
      oldRate === ssp.info.dailyRate &&
      oldAwe === ssp.info.averageWeeklyEarnings
    ) {
      continue;
    }
    changes += 1;
    console.log(
      `${spell.user.name} ${spell.startDate.toISOString().slice(0, 10)}–${spell.endDate
        .toISOString()
        .slice(0, 10)}: days ${spell.sspDaysPaid} → ${ssp.sspDaysPaid}, daily rate ${
        oldRate ?? "not stored"
      } → ${ssp.info.dailyRate}, average weekly earnings ${
        oldAwe ?? "none"
      } → ${ssp.info.averageWeeklyEarnings ?? "none recorded (flat rate)"}`
    );
  }

  if (!apply) {
    console.log(`\n${changes} of ${spells.length} SSP absences would change. Run with --apply to write them.`);
    return;
  }

  let written = 0;
  for (const userId of new Set(spells.map((s) => s.userId))) {
    written += await recomputeAllSspSpells(userId);
  }
  console.log(`\nUpdated ${written} of ${spells.length} SSP absences.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
