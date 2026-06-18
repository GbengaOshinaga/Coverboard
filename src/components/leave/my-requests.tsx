"use client";

import { useRouter } from "next/navigation";
import { RequestCard } from "./request-card";
import { useToast } from "@/components/ui/toast";

type LeaveRequest = {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  note: string | null;
  createdAt: string;
  coverOverride?: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    memberType: string;
    regionId?: string | null;
  };
  leaveType: { id: string; name: string; color: string };
  reviewedBy: { name: string } | null;
};

export function MyRequests({
  requests,
  regionsEnabled = false,
}: {
  requests: LeaveRequest[];
  regionsEnabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const isUpcomingApproved = (r: LeaveRequest) =>
    r.status === "APPROVED" && new Date(r.endDate).getTime() >= todayMs;

  const pending = requests
    .filter((r) => r.status === "PENDING")
    .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
  const upcoming = requests
    .filter(isUpcomingApproved)
    .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
  const past = requests
    .filter((r) => r.status !== "PENDING" && !isUpcomingApproved(r))
    .sort((a, b) => +new Date(b.startDate) - +new Date(a.startDate));

  async function handleAction(id: string, status: string) {
    // Members can only cancel their own requests from this view.
    if (status !== "CANCELLED") return;
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (res.ok) {
        toast("Request cancelled", "info");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Couldn't cancel that request", "error");
      }
    } catch {
      toast("Something went wrong", "error");
    }
  }

  function Section({
    title,
    items,
  }: {
    title: string;
    items: LeaveRequest[];
  }) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {items.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            canReview={false}
            canCancel
            regionsEnabled={regionsEnabled}
            onAction={handleAction}
          />
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">
          You haven&apos;t requested any time off yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Awaiting approval" items={pending} />
      <Section title="Upcoming" items={upcoming} />
      <Section title="Past" items={past} />
    </div>
  );
}
