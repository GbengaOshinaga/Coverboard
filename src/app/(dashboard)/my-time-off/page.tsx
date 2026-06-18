import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { Plus, CalendarHeart, CalendarDays } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserLeaveBalances } from "@/lib/leave-balances";
import { LeaveBalances } from "@/components/dashboard/leave-balances";
import { MyRequests } from "@/components/leave/my-requests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateRange } from "@/lib/utils";

export const metadata: Metadata = { title: "My time off" };

export default async function MyTimeOffPage() {
  const session = await getServerSession(authOptions);
  const userId = (session!.user as Record<string, unknown>).id as string;
  const orgId = (session!.user as Record<string, unknown>)
    .organizationId as string;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const year = startOfToday.getFullYear();

  const [balances, rawRequests, userRow, orgRow] = await Promise.all([
    getUserLeaveBalances(userId, year),
    prisma.leaveRequest.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            memberType: true,
            regionId: true,
          },
        },
        leaveType: { select: { id: true, name: true, color: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { startDate: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { workCountry: true, countryCode: true },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { ukBankHolidayRegion: true, regionsEnabled: true },
    }),
  ]);

  const country = userRow?.workCountry ?? userRow?.countryCode ?? "GB";

  const [publicHols, bankHols] = await Promise.all([
    prisma.publicHoliday.findMany({
      where: {
        organizationId: orgId,
        countryCode: country,
        date: { gte: startOfToday },
      },
      orderBy: { date: "asc" },
      take: 5,
      select: { id: true, name: true, date: true },
    }),
    country === "GB"
      ? prisma.bankHoliday.findMany({
          where: {
            organizationId: orgId,
            region: orgRow?.ukBankHolidayRegion ?? "ENGLAND_WALES",
            date: { gte: startOfToday },
          },
          orderBy: { date: "asc" },
          take: 5,
          select: { id: true, name: true, date: true },
        })
      : Promise.resolve([]),
  ]);

  const holidays = [...publicHols, ...bankHols]
    .sort((a, b) => +a.date - +b.date)
    .slice(0, 5);

  const requests = rawRequests.map((r) => ({
    id: r.id,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    status: r.status,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    coverOverride: r.coverOverride ?? undefined,
    user: {
      id: r.user.id,
      name: r.user.name,
      email: r.user.email,
      memberType: r.user.memberType,
      regionId: r.user.regionId,
    },
    leaveType: r.leaveType,
    reviewedBy: r.reviewedBy,
  }));

  const nextOff = rawRequests
    .filter((r) => r.status === "APPROVED" && r.endDate >= startOfToday)
    .sort((a, b) => +a.startDate - +b.startDate)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            My time off
          </h1>
          <p className="text-sm text-gray-500">
            Your balance, upcoming time off, and request history.
          </p>
        </div>
        <Link
          href="/requests/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Request time off
        </Link>
      </div>

      {nextOff && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-sm text-gray-700">
          <CalendarHeart className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
          <span>
            Your next time off:{" "}
            <span className="font-medium text-gray-900">
              {formatDateRange(
                new Date(nextOff.startDate),
                new Date(nextOff.endDate)
              )}
            </span>{" "}
            — {nextOff.leaveType.name}
          </span>
        </div>
      )}

      <LeaveBalances balances={balances} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Your requests
        </h2>
        <MyRequests
          requests={requests}
          regionsEnabled={orgRow?.regionsEnabled ?? false}
        />
      </div>

      {holidays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-brand-500" />
              Upcoming public holidays
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-gray-100">
              {holidays.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-gray-700">{h.name}</span>
                  <span className="text-gray-500">
                    {h.date.toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
