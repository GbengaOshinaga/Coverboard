"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

export type CoverConflict = {
  date: string;
  available: number;
  required: number;
  shortfall: number;
  staffOff: Array<{ id: string; name: string; leaveType: string | null }>;
};

const FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return FMT.format(new Date(y, m - 1, d));
}

export function ApproveCoverModal({
  open,
  onClose,
  onConfirm,
  conflicts,
  regionName,
  requesterName,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  conflicts: CoverConflict[];
  regionName: string | null;
  requesterName: string;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => (loading ? null : onClose())}
      title="Approve below minimum cover?"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-1.5">
            <p className="font-medium">
              Approving {requesterName}&apos;s leave will leave{" "}
              <strong>{regionName ?? "this region"}</strong> below its minimum
              cover on {conflicts.length} day
              {conflicts.length === 1 ? "" : "s"}.
            </p>
            <ul className="space-y-0.5 text-xs">
              {conflicts.slice(0, 8).map((c) => (
                <li key={c.date}>
                  {formatDay(c.date)}: {c.available}/{c.required} available
                  {c.staffOff.length > 0 && (
                    <span className="text-amber-700">
                      {" "}
                      — already off:{" "}
                      {c.staffOff.map((s) => s.name).join(", ")}
                    </span>
                  )}
                </li>
              ))}
              {conflicts.length > 8 && (
                <li className="text-amber-700">
                  …and {conflicts.length - 8} more.
                </li>
              )}
            </ul>
          </div>
        </div>
        <p className="text-xs text-gray-600">
          Approving anyway will record a cover override against this request.
          The action is logged in your audit history.
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
          >
            {loading ? "Approving..." : "Approve and override cover"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
