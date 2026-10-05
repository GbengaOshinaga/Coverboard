import type { CoverCandidate, CoverOfferSummary, RuledOutMember } from "@/lib/shiftCover";

/** One short shift, as the cover check reports it. */
export type ShortShift = {
  date: string;
  shiftId?: string | null;
  shiftName?: string | null;
  available: number;
  required: number;
  coverCandidates?: CoverCandidate[];
  ruledOut?: RuledOutMember[];
  offers?: CoverOfferSummary[];
};

export type PersonOption = {
  date: string;
  shiftId: string | null;
  shiftName: string | null;
  weekHours: number;
  /** Set when covering would take them past 48 hours that week. */
  hoursIfCovered?: number;
  offer: CoverOfferSummary | null;
};

export type PersonCover = {
  id: string;
  name: string;
  employmentType: string | null;
  options: PersonOption[];
};

export type PersonRuledOut = {
  id: string;
  name: string;
  restShifts: number;
  /** Of restShifts: clashes with cover they've already accepted. */
  coverShifts: number;
  leaveShifts: number;
};

export type GroupedCover = {
  shifts: Array<ShortShift & { noOneFree: boolean }>;
  people: PersonCover[];
  ruledOut: PersonRuledOut[];
};

/**
 * Turns "for each short shift, who could cover it" into "for each person,
 * which short shifts they could cover" — a long absence lists every shift
 * once and every person once, instead of repeating everyone under every shift.
 *
 * People who can cover the most shifts come first. Someone free for some
 * shifts and ruled out for others appears in both lists.
 */
export function groupCoverByPerson(conflicts: ReadonlyArray<ShortShift>): GroupedCover {
  const people = new Map<string, PersonCover>();
  const out = new Map<string, PersonRuledOut>();

  for (const c of conflicts) {
    for (const cand of c.coverCandidates ?? []) {
      const p = people.get(cand.id) ?? {
        id: cand.id,
        name: cand.name,
        employmentType: cand.employmentType,
        options: [],
      };
      const offer = [...(c.offers ?? [])].reverse().find((o) => o.userId === cand.id) ?? null;
      p.options.push({
        date: c.date,
        shiftId: c.shiftId ?? null,
        shiftName: c.shiftName ?? null,
        weekHours: cand.weekHours,
        ...(cand.hoursIfCovered !== undefined ? { hoursIfCovered: cand.hoursIfCovered } : {}),
        offer,
      });
      people.set(cand.id, p);
    }
    for (const r of c.ruledOut ?? []) {
      const p = out.get(r.id) ?? { id: r.id, name: r.name, restShifts: 0, coverShifts: 0, leaveShifts: 0 };
      if (r.reason === "rest") {
        p.restShifts += 1;
        if (r.coverClash) p.coverShifts += 1;
      } else p.leaveShifts += 1;
      out.set(r.id, p);
    }
  }

  const byCountThenName = <T extends { name: string }>(count: (t: T) => number) => (a: T, b: T) =>
    count(b) - count(a) || a.name.localeCompare(b.name);

  return {
    shifts: conflicts.map((c) => ({ ...c, noOneFree: (c.coverCandidates ?? []).length === 0 })),
    people: [...people.values()].sort(byCountThenName((p) => p.options.length)),
    ruledOut: [...out.values()].sort(byCountThenName((p) => p.restShifts + p.leaveShifts)),
  };
}
