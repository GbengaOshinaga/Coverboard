export function buildPayrollHolidayRateFields(params: {
  isUkBased: boolean;
  dailyRate: number | null;
  estimatedPay: number | null;
  rateSource: "captured_at_booking" | "recalculated" | "not_applicable";
}) {
  if (!params.isUkBased) return {};
  return {
    dailyHolidayPayRate: params.dailyRate,
    estimatedPay: params.estimatedPay,
    rateSource: params.rateSource,
  };
}
