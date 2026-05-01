export const HOLIDAY_PAY_NOT_APPLICABLE_ERROR = "NOT_APPLICABLE";
export const HOLIDAY_PAY_NOT_APPLICABLE_MESSAGE =
  "Holiday pay earnings history only applies to UK-based employees.";

export function isUkHolidayPayApplicable(
  workCountry: string | null | undefined
): boolean {
  return workCountry === "GB";
}

export function holidayPayNotApplicablePayload() {
  return {
    error: HOLIDAY_PAY_NOT_APPLICABLE_ERROR,
    message: HOLIDAY_PAY_NOT_APPLICABLE_MESSAGE,
  };
}
