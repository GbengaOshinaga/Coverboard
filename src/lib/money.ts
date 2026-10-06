/**
 * Pounds for the screen: "£1,800.00". Exports keep plain numbers (1800.00)
 * so spreadsheets read them as numbers (src/lib/export-formats.ts).
 */
export function formatGBP(amount: number): string {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
