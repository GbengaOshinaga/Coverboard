export type CoverageSourceUser = {
  id: string;
  name: string;
  email: string;
  countryCode: string;
  workCountry: string | null;
  department: string | null;
  employmentType: string;
  weeklyEarnings: Array<{ weekStartDate: Date; isZeroPayWeek: boolean }>;
};

export function buildEarningsCoverageRows(users: CoverageSourceUser[]) {
  return users
    .filter((u) => u.workCountry === "GB")
    .map((u) => {
      const totalWeeks = u.weeklyEarnings.length;
      const paidWeeks = u.weeklyEarnings.filter((w) => !w.isZeroPayWeek).length;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        countryCode: u.countryCode,
        department: u.department,
        employmentType: u.employmentType,
        totalWeeks,
        paidWeeks,
        lastWeekStartDate: u.weeklyEarnings[0]?.weekStartDate?.toISOString() ?? null,
        hasAnyHistory: totalWeeks > 0,
      };
    });
}
