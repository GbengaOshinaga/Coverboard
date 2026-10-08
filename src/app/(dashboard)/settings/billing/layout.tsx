import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Billing is for admins only (the billing APIs refuse everyone else). Send
 * anyone else back to Settings before the page loads, instead of letting it
 * render and fail with "Could not load billing information".
 */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if ((session.user as Record<string, unknown>).role !== "ADMIN") redirect("/settings");
  return <>{children}</>;
}
