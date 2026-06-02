"use client";

import { useState } from "react";
import { Receipt, Trash2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  BILLING_COUNTRIES,
  DEFAULT_BILLING_COUNTRY,
  TAX_ID_TYPE_LABELS,
  suggestedTaxIdType,
} from "@/config/billing-countries";

export type TaxId = {
  id: string;
  type: string;
  typeLabel: string;
  value: string;
  verificationStatus: string | null;
};

type Props = {
  billingCountry: string | null;
  taxIds: TaxId[];
  onChanged: () => void;
};

const TAX_ID_TYPE_OPTIONS = Object.entries(TAX_ID_TYPE_LABELS).map(
  ([type, label]) => ({ type, label })
);

export function BillingTaxSection({
  billingCountry,
  taxIds,
  onChanged,
}: Props) {
  const { toast } = useToast();

  const [countryEditing, setCountryEditing] = useState(false);
  // Default pendingCountry to the existing value if there is one, otherwise
  // GB (matches the visible default in the dropdown). Initialising to "" —
  // as we used to — caused a silent mismatch: the browser displayed the
  // first option (GB) but the bound state stayed "" until the user clicked
  // a different option. Submitting unchanged then sent an empty string and
  // tripped the API's length(2) check.
  const [pendingCountry, setPendingCountry] = useState(
    billingCountry ?? DEFAULT_BILLING_COUNTRY
  );
  const [countryBusy, setCountryBusy] = useState(false);

  function beginEditingCountry() {
    setPendingCountry(billingCountry ?? DEFAULT_BILLING_COUNTRY);
    setCountryEditing(true);
  }

  function cancelEditingCountry() {
    setPendingCountry(billingCountry ?? DEFAULT_BILLING_COUNTRY);
    setCountryEditing(false);
  }

  // Default the new-tax-id type to whatever fits the current billing country.
  const initialType = suggestedTaxIdType(billingCountry) ?? "gb_vat";
  const [newType, setNewType] = useState(initialType);
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function saveCountry() {
    // Defensive: if pendingCountry is somehow blank when Save is clicked,
    // short-circuit with a friendly client-side message rather than letting
    // the API return its raw length-validation error.
    if (!pendingCountry) {
      toast("Pick a country before saving.", "error");
      return;
    }
    setCountryBusy(true);
    const res = await fetch("/api/billing/customer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: pendingCountry }),
    });
    setCountryBusy(false);
    if (res.ok) {
      toast("Billing country updated", "success");
      setCountryEditing(false);
      onChanged();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast(data.error ?? "Could not update billing country", "error");
    }
  }

  async function addTaxId() {
    if (!newValue.trim()) return;
    setAdding(true);
    const res = await fetch("/api/billing/tax-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: newType, value: newValue.trim() }),
    });
    setAdding(false);
    if (res.ok) {
      toast("Tax ID added", "success");
      setNewValue("");
      onChanged();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast(data.error ?? "Could not add tax ID", "error");
    }
  }

  async function removeTaxId(id: string) {
    setRemovingId(id);
    const res = await fetch(`/api/billing/tax-id/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (res.ok) {
      toast("Tax ID removed", "success");
      onChanged();
    } else {
      toast("Could not remove tax ID", "error");
    }
  }

  const currentCountryName =
    BILLING_COUNTRIES.find((c) => c.code === billingCountry)?.name ??
    billingCountry ??
    "Not set";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt size={18} />
          Tax & VAT
        </CardTitle>
        <CardDescription>
          Used to calculate the right tax on your invoices. EU and UK B2B
          customers can attach a VAT number for reverse-charge billing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Billing country
          </p>
          {countryEditing ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={pendingCountry}
                onChange={(e) => setPendingCountry(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {BILLING_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={saveCountry} disabled={countryBusy}>
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={cancelEditingCountry}
                disabled={countryBusy}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-3">
              <p className="text-sm text-gray-900">{currentCountryName}</p>
              <button
                onClick={beginEditingCountry}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Change
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Tax rate is recalculated on your next invoice when you change
            this.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Tax IDs
          </p>
          {taxIds.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              No tax IDs added yet. Add your company&rsquo;s VAT number below
              if you&rsquo;re an EU or UK B2B customer.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {taxIds.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {t.value}{" "}
                      <span className="ml-1 font-normal text-gray-500">
                        ({t.typeLabel})
                      </span>
                    </p>
                    {t.verificationStatus && (
                      <VerificationBadge status={t.verificationStatus} />
                    )}
                  </div>
                  <button
                    onClick={() => removeTaxId(t.id)}
                    disabled={removingId === t.id}
                    className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Type
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {TAX_ID_TYPE_OPTIONS.map((o) => (
                  <option key={o.type} value={o.type}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Number
              </label>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="GB123456789"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <Button
              size="sm"
              onClick={addTaxId}
              disabled={adding || !newValue.trim()}
            >
              {adding ? "Adding…" : "Add tax ID"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Stripe validates UK VAT (HMRC) and EU VAT (VIES) numbers when you
            submit. Verification can take a moment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function VerificationBadge({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <Badge variant="success" className="mt-1 inline-flex items-center gap-1">
        <Check className="h-3 w-3" />
        Verified
      </Badge>
    );
  }
  if (status === "unverified") {
    return (
      <Badge variant="warning" className="mt-1 inline-flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Unverified
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="mt-1">
      {status}
    </Badge>
  );
}
