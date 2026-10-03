"use client";

import { useState } from "react";
import { Hand } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Answer = {
  id: string;
  status: "ACCEPTED" | "DECLINED" | "WITHDRAWN";
  date: string;
  personName: string;
  shiftName: string;
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));
const todayIso = () => new Date().toISOString().slice(0, 10);

const VERB: Record<Answer["status"], { text: string; cls: string }> = {
  ACCEPTED: { text: "will cover", cls: "text-emerald-700" },
  DECLINED: { text: "can't cover", cls: "text-gray-600" },
  WITHDRAWN: { text: "dropped out of", cls: "text-red-700" },
};

export function CoverUpdatesList({ answers }: { answers: Answer[] }) {
  const [rows, setRows] = useState(answers);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function withdraw(id: string) {
    setError("");
    const res = await fetch(`/api/cover-offers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't withdraw it");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setConfirm(null);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hand className="h-4 w-4 text-gray-500" />
          Cover updates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-gray-100 text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium text-gray-900">{a.personName}</span>{" "}
                <span className={VERB[a.status].cls}>{VERB[a.status].text}</span>{" "}
                {a.shiftName} · {fmt(a.date)}
              </span>
              {a.status === "ACCEPTED" && a.date >= todayIso() && (
                <button
                  type="button"
                  onClick={() => (confirm === a.id ? withdraw(a.id) : setConfirm(a.id))}
                  className={`text-xs ${confirm === a.id ? "font-medium text-red-700" : "text-gray-500 hover:text-gray-800"}`}
                >
                  {confirm === a.id ? "Take them off? (emails them)" : "Withdraw"}
                </button>
              )}
              {a.status === "WITHDRAWN" && a.date >= todayIso() && (
                <span className="text-xs font-medium text-red-700">Shift is short again</span>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </CardContent>
    </Card>
  );
}
