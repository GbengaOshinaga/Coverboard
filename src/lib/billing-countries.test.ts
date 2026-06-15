import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_COUNTRIES,
  DEFAULT_BILLING_COUNTRY,
  isValidBillingCountry,
  suggestedTaxIdType,
  TAX_ID_TYPE_LABELS,
} from "@/config/billing-countries";

test("DEFAULT_BILLING_COUNTRY is the first entry of BILLING_COUNTRIES", () => {
  assert.equal(BILLING_COUNTRIES[0]!.code, DEFAULT_BILLING_COUNTRY);
  assert.equal(DEFAULT_BILLING_COUNTRY, "GB", "Coverboard targets UK SMBs");
});

test("BILLING_COUNTRIES has no duplicate ISO codes", () => {
  const codes = BILLING_COUNTRIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("every BILLING_COUNTRIES entry is a 2-letter uppercase ISO code", () => {
  for (const c of BILLING_COUNTRIES) {
    assert.match(c.code, /^[A-Z]{2}$/, `bad code: ${c.code}`);
    assert.ok(c.name.length > 0);
  }
});

test("isValidBillingCountry accepts entries from the list", () => {
  assert.equal(isValidBillingCountry("GB"), true);
  assert.equal(isValidBillingCountry("DE"), true);
  assert.equal(isValidBillingCountry("US"), true);
});

test("isValidBillingCountry rejects unsupported / invalid codes", () => {
  assert.equal(isValidBillingCountry("XX"), false, "made-up code");
  assert.equal(isValidBillingCountry("gb"), false, "lowercase is rejected");
  assert.equal(isValidBillingCountry("GBR"), false, "alpha-3 is rejected");
  assert.equal(isValidBillingCountry(""), false);
  assert.equal(isValidBillingCountry(null), false);
  assert.equal(isValidBillingCountry(undefined), false);
});

test("suggestedTaxIdType maps GB to gb_vat", () => {
  assert.equal(suggestedTaxIdType("GB"), "gb_vat");
});

test("suggestedTaxIdType maps all 27 EU member states to eu_vat", () => {
  const euCountries = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  ];
  for (const code of euCountries) {
    assert.equal(
      suggestedTaxIdType(code),
      "eu_vat",
      `${code} should map to eu_vat`
    );
  }
});

test("suggestedTaxIdType returns null for countries without a Stripe tax-id mapping", () => {
  assert.equal(suggestedTaxIdType("KE"), null);
  assert.equal(suggestedTaxIdType(null), null);
  assert.equal(suggestedTaxIdType(""), null);
});

test("every suggestedTaxIdType result has a corresponding TAX_ID_TYPE_LABELS entry", () => {
  for (const c of BILLING_COUNTRIES) {
    const suggested = suggestedTaxIdType(c.code);
    if (suggested) {
      assert.ok(
        TAX_ID_TYPE_LABELS[suggested],
        `${c.code} suggests "${suggested}" but no label exists`
      );
    }
  }
});

test("non-EU European countries (CH, NO) map to their national VAT types, not eu_vat", () => {
  assert.equal(suggestedTaxIdType("CH"), "ch_vat");
  assert.equal(suggestedTaxIdType("NO"), "no_vat");
});
