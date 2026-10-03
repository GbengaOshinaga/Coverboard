import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function NotFound() {
  // Only offer the dashboard to people who can open it; everyone else gets
  // the public pages.
  const session = await getServerSession(authOptions).catch(() => null);
  const signedIn = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-xl">
        CB
      </div>
      <h1 className="mt-6 text-6xl font-bold text-gray-900">404</h1>
      <p className="mt-2 text-lg text-gray-600">
        Page not found
      </p>
      <p className="mt-1 text-sm text-gray-400 max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Link
          href={signedIn ? "/dashboard" : "/"}
          className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          {signedIn ? "Go to dashboard" : "Go to homepage"}
        </Link>
        <Link
          href={signedIn ? "/" : "/guides"}
          className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {signedIn ? "Home" : "Browse guides"}
        </Link>
      </div>
    </div>
  );
}
