"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Avatar } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";

export function Topbar() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div>
        <h2 className="text-sm font-medium text-gray-500">
          {(user as Record<string, unknown> | undefined)?.organizationName as string ?? "Team"}
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-3">
            <Link href="/settings/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Avatar name={user.name ?? "User"} size="sm" />
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {user.name}
                </p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
