"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Plus, MessageSquare, CheckCircle, XCircle, User, ChevronRight, SquareKanban, ExternalLink, Unlink } from "lucide-react";

type LeaveType = {
  id: string;
  name: string;
  color: string;
  isPaid: boolean;
  defaultDays: number;
};

type SlackStatus = {
  configured: boolean;
  connected: boolean;
  botName: string | null;
  teamName?: string | null;
  channel: string | null;
  error?: string;
};

type JiraStatus = {
  configured: boolean;
  connected: boolean;
  siteUrl: string | null;
  connectedBy: string | null;
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newDays, setNewDays] = useState("20");
  const [newIsPaid, setNewIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [jiraStatus, setJiraStatus] = useState<JiraStatus | null>(null);
  const [disconnectingJira, setDisconnectingJira] = useState(false);

  const user = session?.user as Record<string, unknown> | undefined;
  const userRole = user?.role as string | undefined;
  const orgName = user?.organizationName as string | undefined;
  const isAdmin = userRole === "ADMIN";

  const fetchLeaveTypes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leave-types");
    if (res.ok) {
      setLeaveTypes(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  // Check Slack integration status
  useEffect(() => {
    async function checkSlack() {
      try {
        const res = await fetch("/api/slack/status");
        if (res.ok) {
          setSlackStatus(await res.json());
        }
      } catch {
        // Silently fail
      }
    }
    checkSlack();
  }, []);

  useEffect(() => {
    async function checkJira() {
      try {
        const res = await fetch("/api/jira/status");
        if (res.ok) {
          setJiraStatus(await res.json());
        }
      } catch {
        // Silently fail
      }
    }
    checkJira();
  }, []);

  async function handleAddLeaveType(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/leave-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        color: newColor,
        isPaid: newIsPaid,
        defaultDays: parseInt(newDays),
      }),
    });

    if (res.ok) {
      setShowAdd(false);
      setNewName("");
      setNewColor("#6366f1");
      setNewDays("20");
      setNewIsPaid(true);
      fetchLeaveTypes();
    }

    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">
          Manage your organization and leave policies
        </p>
      </div>

      {/* Profile link */}
      <Link href="/settings/profile">
        <Card className="hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Profile &amp; account</p>
                  <p className="text-xs text-gray-500">Edit your name, change your password</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Organization info */}
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Your team information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Name</span>
              <span className="text-sm font-medium">{orgName ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Your role</span>
              <Badge variant={userRole === "ADMIN" ? "default" : "outline"}>
                {userRole ?? "—"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave types */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Leave types</CardTitle>
              <CardDescription>
                Configure the types of leave available in your organization
              </CardDescription>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add type
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-4 text-center text-sm text-gray-400">
              Loading...
            </p>
          ) : leaveTypes.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No leave types configured yet.
            </p>
          ) : (
            <div className="space-y-2">
              {leaveTypes.map((lt) => (
                <div
                  key={lt.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: lt.color }}
                    />
                    <span className="text-sm font-medium">{lt.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {lt.defaultDays} days
                    </span>
                    <Badge variant={lt.isPaid ? "success" : "outline"}>
                      {lt.isPaid ? "Paid" : "Unpaid"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slack integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-5 w-5" />
                Slack Integration
              </CardTitle>
              <CardDescription>
                Connect Slack for /whosout, /requestleave, and /mybalance commands
              </CardDescription>
            </div>
            {slackStatus?.connected ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Connected
              </Badge>
            ) : slackStatus?.configured ? (
              <Badge variant="error" className="flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Error
              </Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {slackStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Bot name</span>
                <span className="font-medium">@{slackStatus.botName}</span>
              </div>
              {slackStatus.teamName && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Workspace</span>
                  <span className="font-medium">{slackStatus.teamName}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Notification channel</span>
                <span className="font-medium">{slackStatus.channel}</span>
              </div>
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Available commands:</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <p><code className="rounded bg-gray-200 px-1">/whosout</code> — See who&apos;s off today and this week</p>
                  <p><code className="rounded bg-gray-200 px-1">/mybalance</code> — Check your leave balance</p>
                  <p><code className="rounded bg-gray-200 px-1">/requestleave</code> — Submit a leave request from Slack</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                To enable the Slack bot, add these environment variables to your deployment:
              </p>
              <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600 space-y-1">
                <p>SLACK_BOT_TOKEN=xoxb-...</p>
                <p>SLACK_SIGNING_SECRET=...</p>
                <p>SLACK_NOTIFICATION_CHANNEL=#time-off</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700">
                  <strong>Setup guide:</strong> Create a Slack app at{" "}
                  <a
                    href="https://api.slack.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    api.slack.com/apps
                  </a>
                  . Add bot token scopes: <code className="rounded bg-blue-100 px-1">commands</code>,{" "}
                  <code className="rounded bg-blue-100 px-1">chat:write</code>,{" "}
                  <code className="rounded bg-blue-100 px-1">users:read</code>,{" "}
                  <code className="rounded bg-blue-100 px-1">users:read.email</code>.
                  Set slash command URLs to <code className="rounded bg-blue-100 px-1">your-domain/api/slack/commands</code>{" "}
                  and interactivity URL to <code className="rounded bg-blue-100 px-1">your-domain/api/slack/interactions</code>.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jira integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 mb-2">
                <SquareKanban className="h-5 w-5" />
                Jira Integration
              </CardTitle>
              <CardDescription>
                See unfinished tasks when someone goes on leave and reassign with one click
              </CardDescription>
            </div>
            {jiraStatus?.connected ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Connected
              </Badge>
            ) : jiraStatus?.configured ? (
              <Badge variant="outline">Not connected</Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {jiraStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Jira site</span>
                <a
                  href={jiraStatus.siteUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:text-brand-500 flex items-center gap-1"
                >
                  {jiraStatus.siteUrl?.replace("https://", "")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Connected by</span>
                <span className="font-medium">{jiraStatus.connectedBy}</span>
              </div>
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">What this enables:</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <p>Coverage warnings when someone goes on leave with open tasks</p>
                  <p>Available teammate suggestions for task reassignment</p>
                  <p>One-click issue reassignment from the leave review screen</p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={disconnectingJira}
                  onClick={async () => {
                    setDisconnectingJira(true);
                    try {
                      const res = await fetch("/api/jira/disconnect", { method: "POST" });
                      if (res.ok) {
                        setJiraStatus({ configured: true, connected: false, siteUrl: null, connectedBy: null });
                      }
                    } catch {
                      // Silently fail
                    } finally {
                      setDisconnectingJira(false);
                    }
                  }}
                >
                  <Unlink className="mr-1 h-3.5 w-3.5" />
                  {disconnectingJira ? "Disconnecting..." : "Disconnect Jira"}
                </Button>
              )}
            </div>
          ) : jiraStatus?.configured ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Connect your Jira Cloud site to see coverage warnings when team members go on leave.
              </p>
              {isAdmin ? (
                <Button
                  size="sm"
                  onClick={() => { window.location.href = "/api/jira/connect"; }}
                >
                  Connect Jira
                </Button>
              ) : (
                <p className="text-xs text-gray-400">Ask an admin to connect Jira.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                To enable the Jira integration, add these environment variables to your deployment:
              </p>
              <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600 space-y-1">
                <p>JIRA_CLIENT_ID=...</p>
                <p>JIRA_CLIENT_SECRET=...</p>
                <p>JIRA_REDIRECT_URI=https://your-domain/api/jira/callback</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700">
                  <strong>Setup guide:</strong> Create an OAuth 2.0 (3LO) app at{" "}
                  <a
                    href="https://developer.atlassian.com/console/myapps/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    developer.atlassian.com
                  </a>
                  . Add scopes: <code className="rounded bg-blue-100 px-1">read:jira-work</code>,{" "}
                  <code className="rounded bg-blue-100 px-1">write:jira-work</code>,{" "}
                  <code className="rounded bg-blue-100 px-1">read:jira-user</code>,{" "}
                  <code className="rounded bg-blue-100 px-1">read:me</code>,{" "}
                  <code className="rounded bg-blue-100 px-1">offline_access</code>.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add leave type dialog */}
      <Dialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add leave type"
      >
        <form onSubmit={handleAddLeaveType} className="space-y-4">
          <Input
            id="ltName"
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Study Leave"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                />
                <span className="text-xs text-gray-500">{newColor}</span>
              </div>
            </div>
            <Input
              id="ltDays"
              label="Default days"
              type="number"
              min="1"
              value={newDays}
              onChange={(e) => setNewDays(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newIsPaid}
              onChange={(e) => setNewIsPaid(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Paid leave
          </label>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Adding..." : "Add leave type"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
