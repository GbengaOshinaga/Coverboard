"use client";

import { formatGBP } from "@/lib/money";
import { SMP_FLAT_RATE } from "@/lib/smpCalculator";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { OverlapWarning } from "./overlap-warning";
import { BalanceIndicator } from "./balance-indicator";
import { neonatalWeeksEntitled } from "@/lib/neonatalPay";
import { CoverageWarning } from "./coverage-warning";
import { RegionalCoverWarning } from "./regional-cover-warning";
import { countWeekdays } from "@/lib/utils";
import { countWorkingDays } from "@/lib/working-week";
import { AddChildForm, childName, usageLine, useChildren } from "@/components/team/children";

type LeaveType = {
  id: string;
  name: string;
  color: string;
  requiresEvidence: boolean;
  minNoticeDays: number;
  /** WEEKS for statutory family leave (shown in weeks as well as days). */
  allowanceUnit?: "DAYS" | "WEEKS";
};

type OverlapData = {
  overlapping: {
    id: string;
    user: { id: string; name: string; memberType: string };
    leaveType: { name: string; color: string };
    startDate: string;
    endDate: string;
    status: string;
  }[];
  teamCount: number;
  uniqueUsersOut: number;
  coverageRatio: number;
  isHighOverlap: boolean;
};

type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
  unit?: "days" | "hours";
  entitlementHours?: number;
  avgHoursPerDay?: number;
};

export function RequestForm({
  leaveTypes,
  currentUserId,
  teamMembers,
}: {
  leaveTypes: LeaveType[];
  currentUserId?: string;
  /**
   * Admins and managers: the team, so they can record leave for someone else
   * (e.g. maternity leave from a MATB1). Recorded as approved.
   */
  teamMembers?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  // Who the leave is for: themselves, or (managers) someone on their team.
  const [subjectId, setSubjectId] = useState(currentUserId ?? "");
  const forSomeoneElse = !!currentUserId && !!subjectId && subjectId !== currentUserId;
  const subjectName = teamMembers?.find((m) => m.id === subjectId)?.name ?? null;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [note, setNote] = useState("");
  const [sicknessNote, setSicknessNote] = useState("");
  const [evidenceProvided, setEvidenceProvided] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [overlapData, setOverlapData] = useState<OverlapData | null>(null);
  const [overlapLoading, setOverlapLoading] = useState(false);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(true);
  // Hours booked, for irregular/zero-hours workers whose balance is in hours.
  const [hoursDraft, setHoursDraft] = useState("");
  const [hoursEdited, setHoursEdited] = useState(false);
  // Expected due date — maternity only, for the SMP service-test.
  const [expectedDueDate, setExpectedDueDate] = useState("");
  const [matchedDate, setMatchedDate] = useState("");
  // Shared parental leave: for a birth or an adoption, and whether their
  // notice claims Shared Parental Pay for these weeks.
  const [splFor, setSplFor] = useState<"birth" | "adoption">("birth");
  const [shppClaimed, setShppClaimed] = useState(true);
  const [childBirthDate, setChildBirthDate] = useState("");
  const [careFirstDay, setCareFirstDay] = useState("");
  const [careLastDay, setCareLastDay] = useState("");

  // Balances of whoever the leave is for.
  useEffect(() => {
    async function fetchBalances() {
      setBalanceLoading(true);
      try {
        const qs = forSomeoneElse ? `?userId=${encodeURIComponent(subjectId)}` : "";
        const res = await fetch(`/api/leave-balances${qs}`);
        if (res.ok) {
          setBalances(await res.json());
        }
      } catch {
        // Silently fail
      }
      setBalanceLoading(false);
    }
    fetchBalances();
  }, [forSomeoneElse, subjectId]);

  const selectedLeaveType = useMemo(
    () => leaveTypes.find((lt) => lt.id === leaveTypeId) ?? null,
    [leaveTypes, leaveTypeId]
  );

  // Gentle, context-aware message for sensitive leave types. Leave management
  // deals with real human situations — the UI shouldn't feel transactional.
  const sensitiveTone = useMemo(() => {
    const n = selectedLeaveType?.name?.toLowerCase() ?? "";
    if (n.includes("bereavement"))
      return "We're sorry for your loss. Take the time you need — submit what you can now and adjust the dates later if things change.";
    if (n.includes("compassionate"))
      return "We hope everything's okay. Just the essentials below — you can add more later if you need to.";
    if (n.includes("ssp") || n.includes("sick"))
      return "Hope you feel better soon. Only the essentials below — you don't need to share a diagnosis.";
    return null;
  }, [selectedLeaveType]);

  const selectedBalance = useMemo(
    () => balances.find((b) => b.leaveTypeId === leaveTypeId) ?? null,
    [balances, leaveTypeId]
  );

  const isSickness = /SSP|Sick/i.test(selectedLeaveType?.name ?? "");
  const isMaternityLeave = /maternity/i.test(selectedLeaveType?.name ?? "");
  const isAdoptionLeave = /adoption/i.test(selectedLeaveType?.name ?? "");
  const isSplLeave = /shared parental|\bSPL\b/i.test(selectedLeaveType?.name ?? "");
  const isPaternityLeave = /paternity/i.test(selectedLeaveType?.name ?? "");
  const isNeonatalLeave = /neonatal/i.test(selectedLeaveType?.name ?? "");
  // Paternity, shared parental and neonatal care leave: the child's due or matching date.
  const asksChildDate = isSplLeave || isPaternityLeave || isNeonatalLeave;
  // Unpaid parental leave is per child, so the booking names the child.
  const isUnpaidParental = /unpaid parental/i.test(selectedLeaveType?.name ?? "");
  const { children, reload: reloadChildren } = useChildren(
    isUnpaidParental ? subjectId || undefined : undefined
  );
  const [childId, setChildId] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  // The days the person would have worked, as their balance counts them
  // (a 4-day worker's four Mon–Fri weeks are 16 days, not 20).
  const [workingWeek, setWorkingWeek] = useState<{ weekdays: number[] | null; daysPerWeek: number } | null>(null);
  useEffect(() => {
    const qs = forSomeoneElse ? `?userId=${encodeURIComponent(subjectId)}` : "";
    fetch(`/api/working-week${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setWorkingWeek)
      .catch(() => setWorkingWeek(null));
  }, [forSomeoneElse, subjectId]);

  const requestedDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    return workingWeek
      ? countWorkingDays(start, end, workingWeek.weekdays)
      : countWeekdays(new Date(startDate), new Date(endDate));
  }, [startDate, endDate, workingWeek]);
  const calendarWeeks = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
    return Math.round((days / 7) * 10) / 10;
  }, [startDate, endDate]);

  // Hours-based balances (irregular/zero-hours workers): the request deducts
  // hours, defaulted to working days × their average day and editable.
  const isHoursLeave = selectedBalance?.unit === "hours";
  const defaultHours = useMemo(
    () =>
      requestedDays > 0
        ? Number((requestedDays * (selectedBalance?.avgHoursPerDay ?? 0)).toFixed(1))
        : 0,
    [requestedDays, selectedBalance?.avgHoursPerDay]
  );
  const requestedHours = isHoursLeave ? parseFloat(hoursDraft) || 0 : 0;

  // Keep the hours field tracking the date range until the user edits it.
  useEffect(() => {
    if (isHoursLeave && !hoursEdited) {
      setHoursDraft(defaultHours > 0 ? String(defaultHours) : "");
    }
  }, [isHoursLeave, hoursEdited, defaultHours]);

  const checkOverlap = useCallback(async () => {
    if (!startDate || !endDate) return;

    setOverlapLoading(true);
    try {
      const params = new URLSearchParams({
        from: new Date(startDate).toISOString(),
        to: new Date(endDate).toISOString(),
      });
      const res = await fetch(`/api/overlap?${params}`);
      if (res.ok) {
        setOverlapData(await res.json());
      }
    } catch {
      // Silently fail overlap check
    }
    setOverlapLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(checkOverlap, 300);
    return () => clearTimeout(timer);
  }, [checkOverlap]);

  useEffect(() => {
    setSicknessNote("");
    setEvidenceProvided(false);
    setHoursEdited(false);
  }, [leaveTypeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Sickness is self-certified for the first 7 days: no evidence is needed
    // to report it. Fit notes are recorded later by a manager.
    const needsEvidence = (selectedLeaveType?.requiresEvidence ?? false) && !isSickness;

    const hasEvidence = !isSickness && evidenceProvided;

    if (needsEvidence && !hasEvidence) {
      setError(
        "Please confirm that supporting evidence is available for this leave type."
      );
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          leaveTypeId,
          note: note || undefined,
          sicknessNote: sicknessNote.trim() || undefined,
          evidenceProvided: needsEvidence ? hasEvidence : undefined,
          hoursBooked: isHoursLeave ? requestedHours : undefined,
          expectedDueDate:
            (isMaternityLeave || (asksChildDate && splFor === "birth")) && expectedDueDate
              ? new Date(expectedDueDate).toISOString()
              : undefined,
          matchedDate:
            (isAdoptionLeave || (asksChildDate && splFor === "adoption")) && matchedDate
              ? new Date(matchedDate).toISOString()
              : undefined,
          shppClaimed: isSplLeave ? shppClaimed : undefined,
          childBirthDate:
            (isPaternityLeave || isNeonatalLeave) && childBirthDate
              ? new Date(childBirthDate).toISOString()
              : undefined,
          neonatalCareFirstDay:
            isNeonatalLeave && careFirstDay ? new Date(careFirstDay).toISOString() : undefined,
          neonatalCareLastDay:
            isNeonatalLeave && careLastDay ? new Date(careLastDay).toISOString() : undefined,
          childId: isUnpaidParental ? childId || undefined : undefined,
          onBehalfOfUserId: forSomeoneElse ? subjectId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit request");
        setLoading(false);
        return;
      }

      if (forSomeoneElse) {
        toast(`Recorded for ${subjectName ?? "them"} as approved. They've been emailed.`, "success");
      } else if (data.firstRequest) {
        toast(
          "🎉 Your first request is in! You'll hear back once it's reviewed.",
          "success"
        );
      }
      // Neonatal care leave: the rate and weeks the time in care gives.
      if (data.sncpInfo) {
        const weeks = `${data.sncpInfo.weeksEntitled} week${data.sncpInfo.weeksEntitled === 1 ? "" : "s"} of leave from the time in care`;
        toast(
          data.sncpInfo.eligible
            ? `Neonatal care pay: ${data.sncpInfo.basis}. ${weeks}.`
            : `No neonatal care pay: ${data.sncpInfo.basis} ${weeks}.`,
          data.sncpInfo.eligible ? "success" : "error"
        );
      }
      // Paternity leave: the SPP rate, or why there's none.
      if (data.sppInfo) {
        toast(
          data.sppInfo.eligible
            ? `SPP: ${data.sppInfo.basis}.`
            : `No SPP: ${data.sppInfo.basis}`,
          data.sppInfo.eligible ? "success" : "error"
        );
      }
      // Shared parental leave claiming pay: the ShPP rate, or why there's none.
      if (data.shppInfo) {
        toast(
          data.shppInfo.eligible
            ? `ShPP: ${formatGBP(data.shppInfo.weeklyRate)} a week. ${data.shppInfo.basis}.`
            : `No ShPP: ${data.shppInfo.basis}`,
          data.shppInfo.eligible ? "success" : "error"
        );
      }
      // Maternity or adoption: SMP or SAP from the earnings in the 8 weeks before.
      if (data.smpInfo) {
        const kind = data.smpInfo.kind ?? "SMP";
        toast(
          data.smpInfo.eligible
            ? `${kind}: ${formatGBP(data.smpInfo.phase1Weekly)} a week for 6 weeks, then ${formatGBP(data.smpInfo.phase2Weekly)} a week for 33 weeks.`
            : kind === "SAP"
              ? `No SAP: ${data.smpInfo.reason}. Give them form SAP1 explaining why.`
              : `No SMP: ${data.smpInfo.reason}. They may get Maternity Allowance instead (form SMP1).`,
          data.smpInfo.eligible ? "success" : "error"
        );
      }

      router.push("/requests");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  const leaveTypeOptions = leaveTypes.map((lt) => {
    const bal = balances.find((b) => b.leaveTypeId === lt.id);
    if (!bal) return { value: lt.id, label: lt.name };
    const left =
      bal.unit === "hours"
        ? `${bal.remaining.toFixed(1)} hrs left`
        : `${bal.remaining} days left`;
    return { value: lt.id, label: `${lt.name} (${left})` };
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {teamMembers && teamMembers.length > 0 && currentUserId && (
        <div className="space-y-1">
          <Select
            id="subject"
            label="Who is it for?"
            options={[
              { value: currentUserId, label: "Me" },
              ...teamMembers
                .filter((m) => m.id !== currentUserId)
                .map((m) => ({ value: m.id, label: m.name })),
            ]}
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setChildId("");
            }}
          />
          {forSomeoneElse && (
            <p className="text-xs text-gray-500">
              Recorded as approved for {subjectName}, for leave already agreed
              with them; notice periods don&apos;t apply. They&apos;ll get an email,
              and it&apos;s in the audit log as recorded by you.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="startDate"
          label="Start date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
        <Input
          id="endDate"
          label="End date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate}
          required
        />
      </div>

      {startDate && endDate && requestedDays > 0 && (
        <p className="text-xs text-gray-500">
          {selectedLeaveType?.allowanceUnit === "WEEKS" && `${calendarWeeks} week${calendarWeeks === 1 ? "" : "s"} · `}
          {requestedDays} working day{requestedDays !== 1 ? "s" : ""}
          {workingWeek && workingWeek.daysPerWeek !== 5
            ? ` (${forSomeoneElse ? `${subjectName ?? "they"} works` : "you work"} ${workingWeek.daysPerWeek} days a week)`
            : ""}
        </p>
      )}

      <Select
        id="leaveType"
        label="Leave type"
        options={leaveTypeOptions}
        placeholder="Select leave type"
        value={leaveTypeId}
        onChange={(e) => setLeaveTypeId(e.target.value)}
        required
      />

      {/* Unpaid parental leave: which child (limits are per child) */}
      {isUnpaidParental && currentUserId && (
        <div className="space-y-2">
          {children && children.length > 0 && (
            <Select
              id="childId"
              label="Which child is this leave for?"
              options={[
                { value: "", label: "Choose a child" },
                ...children.map((c) => ({ value: c.id, label: childName(c) })),
              ]}
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
            />
          )}
          {children?.find((c) => c.id === childId) && (
            <p className="text-xs text-gray-500">
              {usageLine(children.find((c) => c.id === childId)!)}
            </p>
          )}
          {children && children.length === 0 && !addingChild && (
            <p className="text-sm text-gray-600">
              Unpaid parental leave is per child (up to 18 weeks each, at most 4 a year). Add
              the child it&apos;s for.
            </p>
          )}
          {addingChild ? (
            <AddChildForm
              memberId={subjectId}
              onAdded={async (id) => {
                setAddingChild(false);
                await reloadChildren();
                setChildId(id);
              }}
              onCancel={() => setAddingChild(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingChild(true)}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              + Add a child
            </button>
          )}
        </div>
      )}

      {/* Expected due date — maternity, for SMP eligibility (qualifying week) */}
      {isMaternityLeave && (
        <div className="space-y-1">
          <Input
            id="expectedDueDate"
            label="Expected due date"
            type="date"
            value={expectedDueDate}
            onChange={(e) => setExpectedDueDate(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            Used to check Statutory Maternity Pay eligibility (26 weeks&apos;
            service by the qualifying week). Optional.
          </p>
        </div>
      )}

      {/* Matching date — adoption, for SAP (matching week) */}
      {isAdoptionLeave && (
        <div className="space-y-1">
          <Input
            id="matchedDate"
            label="Date they were told of the match"
            type="date"
            value={matchedDate}
            onChange={(e) => setMatchedDate(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            For a UK adoption: the date the agency told them they&apos;d been
            matched with the child. Statutory Adoption Pay needs 26 weeks&apos;
            service by that week, and is worked out from pay in the 8 weeks up
            to it. Without it, pay is worked out from the 8 weeks before the
            leave starts. Overseas adoptions and surrogacy have different dates:
            work those out by hand.
          </p>
        </div>
      )}

      {/* Shared parental leave: the child (birth or adoption) and whether pay is claimed */}
      {asksChildDate && (
        <div className="space-y-3 rounded-lg border border-gray-200 p-3">
          <Select
            id="splFor"
            label={
              isPaternityLeave
                ? "Paternity leave for"
                : isNeonatalLeave
                  ? "Neonatal care leave for"
                  : "Shared parental leave for"
            }
            value={splFor}
            onChange={(e) => setSplFor(e.target.value as "birth" | "adoption")}
            options={[
              { value: "birth", label: "A birth" },
              { value: "adoption", label: "An adoption" },
            ]}
          />
          {splFor === "birth" ? (
            <Input
              id="splDueDate"
              label="Baby's due date"
              type="date"
              value={expectedDueDate}
              onChange={(e) => setExpectedDueDate(e.target.value)}
            />
          ) : (
            <Input
              id="splMatchedDate"
              label="Date they were told of the match"
              type="date"
              value={matchedDate}
              onChange={(e) => setMatchedDate(e.target.value)}
            />
          )}
          {isNeonatalLeave && (
            <>
              <Input
                id="neonatalBirthDate"
                label="Baby's date of birth"
                type="date"
                value={childBirthDate}
                onChange={(e) => setChildBirthDate(e.target.value)}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  id="careFirstDay"
                  label="First full day in neonatal care"
                  type="date"
                  value={careFirstDay}
                  onChange={(e) => setCareFirstDay(e.target.value)}
                />
                <Input
                  id="careLastDay"
                  label="Last full day in care (leave empty if still there)"
                  type="date"
                  value={careLastDay}
                  onChange={(e) => setCareLastDay(e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-500">
                One week of leave and pay for every 7 full days in neonatal care
                in a row, up to 12, taken within 68 weeks of the birth. Pay is
                the lower of {formatGBP(SMP_FLAT_RATE)} or 90% of their average
                weekly earnings, from the 8 weeks up to the{" "}
                {splFor === "birth" ? "15th week before the due week" : "week they were matched"} if
                they get maternity, paternity or adoption pay, otherwise up to
                the week before the baby went into care.
              </p>
            </>
          )}
          {isPaternityLeave && (
            <>
              <Input
                id="childBirthDate"
                label={splFor === "birth" ? "Born on (if the baby has arrived)" : "Placed on (if the child has arrived)"}
                type="date"
                value={childBirthDate}
                onChange={(e) => setChildBirthDate(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Paternity pay is the lower of {formatGBP(SMP_FLAT_RATE)} or 90% of their
                average weekly earnings, worked out from pay in the 8 weeks up to the{" "}
                {splFor === "birth" ? "15th week before the due week" : "week they were matched"},
                with 26 weeks&apos; service by then. Leave must be taken within 52
                weeks of the birth or placement.
              </p>
            </>
          )}
          {isSplLeave && (
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              checked={shppClaimed}
              onChange={(e) => setShppClaimed(e.target.checked)}
            />
            <span>Their notice claims Shared Parental Pay for these weeks</span>
          </label>
          )}
          {isSplLeave && (
          <p className="text-xs text-gray-500">
            Shared Parental Pay is the lower of {formatGBP(SMP_FLAT_RATE)} or 90% of their average
            weekly earnings, for up to 37 weeks between both parents. It&apos;s
            worked out from pay in the 8 weeks up to the{" "}
            {splFor === "birth" ? "15th week before the due week" : "week they were matched"}.
            Untick for weeks they&apos;re taking unpaid. The partner&apos;s
            eligibility is their declaration; you don&apos;t have to check it.
          </p>
          )}
        </div>
      )}

      {/* Hours booked — irregular/zero-hours workers deduct holiday in hours */}
      {isHoursLeave && startDate && endDate && requestedDays > 0 && (
        <div className="space-y-1">
          <Input
            id="hoursBooked"
            label="Hours to book"
            type="number"
            min="0"
            step="0.5"
            value={hoursDraft}
            onChange={(e) => {
              setHoursEdited(true);
              setHoursDraft(e.target.value);
            }}
          />
          <p className="text-xs text-gray-500">
            Your holiday is tracked in hours. We&apos;ve estimated{" "}
            {defaultHours} hours ({requestedDays} day
            {requestedDays !== 1 ? "s" : ""} ×{" "}
            {selectedBalance?.avgHoursPerDay?.toFixed(1)}h average) — adjust if
            this leave covers different hours.
          </p>
        </div>
      )}

      {sensitiveTone && (
        <div className="flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-sm text-gray-700">
          <Heart className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
          <span>{sensitiveTone}</span>
        </div>
      )}

      {/* Balance indicator */}
      {leaveTypeId && (
        isNeonatalLeave ? (
          // Neonatal leave is limited by the time in care (one week per 7 full
          // days, up to 12), in calendar days, not by the type's 12-week allowance.
          (() => {
            if (!careFirstDay) {
              return (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                  Add the days in neonatal care to see how many weeks of leave they give.
                </div>
              );
            }
            const e = neonatalWeeksEntitled({
              firstFullDay: new Date(`${careFirstDay}T00:00:00Z`),
              lastFullDay: careLastDay ? new Date(`${careLastDay}T00:00:00Z`) : null,
            });
            const booked =
              startDate && endDate
                ? Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1
                : 0;
            const over = booked > e.weeks * 7;
            return (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  over || e.weeks === 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-900"
                }`}
              >
                {e.daysInCare} full day{e.daysInCare === 1 ? "" : "s"} in neonatal care
                {e.ongoing ? " so far" : ""}: {e.weeks} week{e.weeks === 1 ? "" : "s"} of leave ({e.weeks * 7} days)
                {e.weeks === 12 ? ", the most" : ""}.
                {booked > 0 && ` This booking is ${booked} day${booked === 1 ? "" : "s"}`}
                {booked > 0 && (over ? ", more than that." : ".")}
                {e.weeks === 0 && " It needs 7 full days in care in a row."}
                {" "}Any other neonatal leave for this baby comes out of the same weeks.
              </div>
            );
          })()
        ) : (
        <BalanceIndicator
          balance={selectedBalance}
          requestedDays={requestedDays}
          requestedHours={requestedHours}
          loading={balanceLoading}
        />
        )
      )}

      <div className="space-y-1">
        <label
          htmlFor="note"
          className="block text-sm font-medium text-gray-700"
        >
          Note (optional)
        </label>
        <textarea
          id="note"
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="Reason for leave..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {isSickness && (
        <div className="space-y-1">
          <label htmlFor="sicknessNote" className="block text-sm font-medium text-gray-700">
            Note for your manager (optional)
          </label>
          <textarea
            id="sicknessNote"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="e.g. Expect to be back Thursday"
            value={sicknessNote}
            onChange={(e) => setSicknessNote(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            You don&apos;t need a fit note for the first 7 days, or to give a
            diagnosis. If you&apos;re off longer, your manager will ask for one.
            Only you and your admin can see this note.
          </p>
        </div>
      )}

      {selectedLeaveType?.requiresEvidence && !isSickness && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Evidence required
          </p>
          <p className="text-xs text-amber-800">
            This leave type requires supporting documentation (e.g. medical or statutory evidence).
          </p>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              checked={evidenceProvided}
              onChange={(e) => setEvidenceProvided(e.target.checked)}
            />
            <span>
              I confirm supporting evidence is available for this leave
            </span>
          </label>
        </div>
      )}

      {selectedLeaveType && selectedLeaveType.minNoticeDays > 0 && !forSomeoneElse && (
        <p className="text-xs text-gray-500">
          This leave type requires at least {selectedLeaveType.minNoticeDays}{" "}
          day{selectedLeaveType.minNoticeDays !== 1 ? "s" : ""} notice before the
          start date.
        </p>
      )}

      {/* Overlap detection */}
      {startDate && endDate && (
        <OverlapWarning data={overlapData} loading={overlapLoading} />
      )}

      {/* Jira coverage warning (informational) */}
      {startDate && endDate && currentUserId && (
        <CoverageWarning
          userId={currentUserId}
          startDate={new Date(startDate).toISOString()}
          endDate={new Date(endDate).toISOString()}
        />
      )}

      {/* Regional minimum-cover warning */}
      {startDate && endDate && (
        <RegionalCoverWarning
          startDate={startDate}
          endDate={endDate}
          userId={currentUserId}
        />
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading
            ? forSomeoneElse
              ? "Recording..."
              : "Submitting..."
            : forSomeoneElse
              ? "Record leave"
              : "Submit request"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
