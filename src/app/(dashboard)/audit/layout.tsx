import type { Metadata } from "next";

export const metadata: Metadata = { title: "Audit trail" };

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
