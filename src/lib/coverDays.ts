/**
 * Whether a region's minimum-cover rule applies on a given day.
 *
 * Shift-based teams (care, hospitality, retail) staff weekends and bank
 * holidays, so each region opts in or out per day type. Kept free of DB
 * imports so both the live cover check and the pure analytics helper can
 * share it.
 */
export type CoverDaySettings = {
  coverWeekends: boolean;
  coverBankHolidays: boolean;
};

export function coverAppliesOn(
  day: { isWeekend: boolean; isBankHoliday: boolean },
  settings: CoverDaySettings
): boolean {
  if (day.isBankHoliday && !settings.coverBankHolidays) return false;
  if (day.isWeekend && !settings.coverWeekends) return false;
  return true;
}
