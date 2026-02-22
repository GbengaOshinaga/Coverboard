"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SquareKanban,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  UserRoundPlus,
} from "lucide-react";

type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  priority: string;
  issueType: string;
  url: string;
};

type Teammate = {
  id: string;
  name: string;
  email: string;
};

type CoverageData = {
  connected: boolean;
  userMapped?: boolean;
  issues: JiraIssue[];
  availableTeammates: Teammate[];
};

const priorityColors: Record<string, string> = {
  Highest: "text-red-600",
  High: "text-orange-600",
  Medium: "text-yellow-600",
  Low: "text-blue-600",
  Lowest: "text-gray-400",
};

export function CoverageWarning({
  userId,
  startDate,
  endDate,
  canReassign = false,
}: {
  userId: string;
  startDate: string;
  endDate: string;
  canReassign?: boolean;
}) {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [reassigned, setReassigned] = useState<Set<string>>(new Set());
  const [selectedAssignee, setSelectedAssignee] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchCoverage() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ userId, startDate, endDate });
        const res = await fetch(`/api/jira/coverage?${params}`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
          if (result.issues?.length > 0) setExpanded(true);
        }
      } catch {
        // Silently fail
      }
      setLoading(false);
    }

    if (userId && startDate && endDate) {
      fetchCoverage();
    }
  }, [userId, startDate, endDate]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <SquareKanban size={14} />
          Checking project coverage...
        </div>
      </div>
    );
  }

  if (!data?.connected) return null;
  if (data.userMapped === false) return null;

  const openIssues = data.issues.filter((i) => !reassigned.has(i.key));

  async function handleReassign(issueKey: string) {
    const newAssigneeUserId = selectedAssignee[issueKey];
    if (!newAssigneeUserId) return;

    setReassigning(issueKey);
    try {
      const res = await fetch("/api/jira/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKey, newAssigneeUserId }),
      });
      if (res.ok) {
        setReassigned((prev) => new Set([...prev, issueKey]));
      }
    } catch {
      // Silently fail
    }
    setReassigning(null);
  }

  if (data.issues.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle size={14} />
          No open Jira issues — coverage looks good
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2.5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
          <AlertTriangle size={14} />
          {openIssues.length} open Jira issue{openIssues.length !== 1 ? "s" : ""} assigned
          {reassigned.size > 0 && (
            <Badge variant="success" className="text-[10px]">
              {reassigned.size} reassigned
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-amber-600" /> : <ChevronDown size={14} className="text-amber-600" />}
      </button>

      {expanded && (
        <div className="border-t border-amber-200 px-3 py-2 space-y-2">
          {data.issues.map((issue) => {
            const isReassigned = reassigned.has(issue.key);
            return (
              <div
                key={issue.key}
                className={`rounded border bg-white p-2.5 text-xs ${isReassigned ? "border-emerald-200 opacity-60" : "border-gray-100"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-medium text-brand-600 hover:text-brand-500 flex items-center gap-0.5"
                      >
                        {issue.key}
                        <ExternalLink size={10} />
                      </a>
                      <span className={`font-medium ${priorityColors[issue.priority] ?? "text-gray-500"}`}>
                        {issue.priority}
                      </span>
                      <Badge variant="outline" className="text-[9px]">{issue.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-gray-700 truncate">{issue.summary}</p>
                  </div>
                  {isReassigned && (
                    <Badge variant="success" className="text-[9px] shrink-0">Reassigned</Badge>
                  )}
                </div>

                {canReassign && !isReassigned && data.availableTeammates.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <UserRoundPlus size={12} className="text-gray-400 shrink-0" />
                    <select
                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      value={selectedAssignee[issue.key] ?? ""}
                      onChange={(e) =>
                        setSelectedAssignee((prev) => ({
                          ...prev,
                          [issue.key]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Reassign to...</option>
                      {data.availableTeammates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!selectedAssignee[issue.key] || reassigning === issue.key}
                      onClick={() => handleReassign(issue.key)}
                      className="text-xs px-2 py-1 h-auto"
                    >
                      {reassigning === issue.key ? "..." : "Reassign"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
