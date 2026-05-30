/**
 * Countries Coverboard accepts as a billing address.
 *
 * Distinct from `COUNTRY_NAMES` in `src/lib/utils.ts`, which is the list of
 * employee work-countries where Coverboard has statutory leave policies. A
 * UK org can perfectly well employ a Nigerian developer, and a German agency
 * can pay for Coverboard even though Coverboard doesn't ship German leave
 * compliance. Those two facts → two separate lists.
 *
 * The first entry is the default at signup. Putting GB first because the
 * product targets UK SMBs.
 */
export const BILLING_COUNTRIES: ReadonlyArray<{ code: string; name: string }> =
  [
    { code: "GB", name: "United Kingdom" },
    { code: "IE", name: "Ireland" },
    { code: "US", name: "United States" },
    { code: "CA", name: "Canada" },
    { code: "AU", name: "Australia" },
    { code: "NZ", name: "New Zealand" },
    { code: "AT", name: "Austria" },
    { code: "BE", name: "Belgium" },
    { code: "BG", name: "Bulgaria" },
    { code: "HR", name: "Croatia" },
    { code: "CY", name: "Cyprus" },
    { code: "CZ", name: "Czech Republic" },
    { code: "DK", name: "Denmark" },
    { code: "EE", name: "Estonia" },
    { code: "FI", name: "Finland" },
    { code: "FR", name: "France" },
    { code: "DE", name: "Germany" },
    { code: "GR", name: "Greece" },
    { code: "HU", name: "Hungary" },
    { code: "IT", name: "Italy" },
    { code: "LV", name: "Latvia" },
    { code: "LT", name: "Lithuania" },
    { code: "LU", name: "Luxembourg" },
    { code: "MT", name: "Malta" },
    { code: "NL", name: "Netherlands" },
    { code: "PL", name: "Poland" },
    { code: "PT", name: "Portugal" },
    { code: "RO", name: "Romania" },
    { code: "SK", name: "Slovakia" },
    { code: "SI", name: "Slovenia" },
    { code: "ES", name: "Spain" },
    { code: "SE", name: "Sweden" },
    { code: "CH", name: "Switzerland" },
    { code: "NO", name: "Norway" },
    { code: "ZA", name: "South Africa" },
    { code: "SG", name: "Singapore" },
    { code: "AE", name: "United Arab Emirates" },
    { code: "JP", name: "Japan" },
    { code: "IN", name: "India" },
    { code: "BR", name: "Brazil" },
    { code: "MX", name: "Mexico" },
    { code: "NG", name: "Nigeria" },
    { code: "KE", name: "Kenya" },
  ];

export const DEFAULT_BILLING_COUNTRY = "GB";

const BILLING_COUNTRY_CODES = new Set(
  BILLING_COUNTRIES.map((c) => c.code)
);

export function isValidBillingCountry(code: string | null | undefined): boolean {
  return typeof code === "string" && BILLING_COUNTRY_CODES.has(code);
}

/**
 * EU member states whose VAT IDs are validated by Stripe under the `eu_vat`
 * tax-id type. Used to auto-derive the tax-id type from the billing country
 * so the customer doesn't have to pick `eu_vat` vs `gb_vat` themselves.
 */
const EU_VAT_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

/**
 * Suggest the Stripe tax-id type matching this billing country. Stripe
 * supports ~50 tax-id types; the few we map here cover the bulk of our
 * audience. For other countries the caller falls back to a free-text input
 * where the customer picks the type.
 */
export function suggestedTaxIdType(country: string | null | undefined): string | null {
  if (!country) return null;
  if (country === "GB") return "gb_vat";
  if (EU_VAT_COUNTRIES.has(country)) return "eu_vat";
  if (country === "AU") return "au_abn";
  if (country === "CA") return "ca_bn";
  if (country === "US") return "us_ein";
  if (country === "NZ") return "nz_gst";
  if (country === "CH") return "ch_vat";
  if (country === "NO") return "no_vat";
  if (country === "ZA") return "za_vat";
  if (country === "SG") return "sg_gst";
  if (country === "AE") return "ae_trn";
  if (country === "IN") return "in_gst";
  if (country === "BR") return "br_cnpj";
  if (country === "MX") return "mx_rfc";
  if (country === "JP") return "jp_cn";
  return null;
}

export type TaxIdTypeOption = { type: string; label: string };

/**
 * Display label for a tax-id type (used in the billing-settings UI when we
 * list existing IDs or show the input type next to a value).
 */
export const TAX_ID_TYPE_LABELS: Record<string, string> = {
  gb_vat: "UK VAT",
  eu_vat: "EU VAT",
  us_ein: "US EIN",
  ca_bn: "Canada BN",
  au_abn: "Australia ABN",
  nz_gst: "New Zealand GST",
  ch_vat: "Switzerland VAT",
  no_vat: "Norway VAT",
  za_vat: "South Africa VAT",
  sg_gst: "Singapore GST",
  ae_trn: "UAE TRN",
  in_gst: "India GSTIN",
  br_cnpj: "Brazil CNPJ",
  mx_rfc: "Mexico RFC",
  jp_cn: "Japan Corporate Number",
};
