import { maternityLeaveLatestEnd, qualifyingWeek } from "@/lib/smp-dates";
import { UK_LEL_WEEKLY } from "@/lib/uk-compliance";

type Stored = string | number | null | undefined;
const num = (v: Stored) => (v === null || v === undefined ? null : Number(v));
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (n: number) => `£${n.toFixed(2)}`;

/**
 * Statutory Maternity Pay on a maternity request: the qualifying week, the
 * earnings it's based on, the two rates, and how long the leave can last —
 * or why there's no SMP. Shown from what's stored, which is recalculated
 * when earnings change.
 */
export function SmpSummary({
  request,
}: {
  request: {
    startDate: string;
    expectedDueDate?: string | null;
    smpAverageWeeklyEarnings?: Stored;
    smpPhase1WeeklyRate?: Stored;
    smpPhase2WeeklyRate?: Stored;
    smpPhase1EndDate?: string | null;
    smpPhase2EndDate?: string | null;
  };
}) {
  const due = request.expectedDueDate ? new Date(request.expectedDueDate) : null;
  const qw = due ? qualifyingWeek(due) : null;
  const awe = num(request.smpAverageWeeklyEarnings);
  const p1 = num(request.smpPhase1WeeklyRate);
  const p2 = num(request.smpPhase2WeeklyRate);
  const latestEnd = maternityLeaveLatestEnd(new Date(request.startDate));

  const reason =
    awe === null
      ? `no pay recorded in the 8 weeks up to ${qw ? "the qualifying week" : "the leave start"}. Add their earnings and this updates`
      : awe < UK_LEL_WEEKLY
        ? `average earnings of ${money(awe)} are below the ${money(UK_LEL_WEEKLY)} Lower Earnings Limit; they may get Maternity Allowance (form SMP1)`
        : "less than 26 weeks' service by the qualifying week; they may get Maternity Allowance (form SMP1)";

  return (
    <div className="mt-2 rounded-md border border-purple-100 bg-purple-50/50 px-3 py-2 text-xs text-gray-700">
      <p className="font-medium text-gray-900">Statutory Maternity Pay</p>
      {qw ? (
        <p>
          Qualifying week {fmt(qw.start)} – {fmt(qw.end)}
          {due ? ` (due ${fmt(due)})` : ""}
        </p>
      ) : (
        <p className="text-amber-700">
          No due date recorded, so earnings are taken from before the leave starts. Add the due date from
          the MATB1.
        </p>
      )}
      {p1 !== null && p2 !== null ? (
        <>
          <p>
            Average weekly earnings {money(awe!)}: {money(p1)} a week (90%) for 6 weeks
            {request.smpPhase1EndDate ? `, to ${fmt(new Date(request.smpPhase1EndDate))}` : ""}, then{" "}
            {money(p2)} a week for 33 weeks
            {request.smpPhase2EndDate ? `, to ${fmt(new Date(request.smpPhase2EndDate))}` : ""}.
          </p>
        </>
      ) : (
        <p className="text-amber-700">No SMP: {reason}.</p>
      )}
      <p className="text-gray-500">
        Maternity leave can last until {fmt(latestEnd)} (52 weeks: 26 ordinary + 26 additional).
      </p>
    </div>
  );
}
