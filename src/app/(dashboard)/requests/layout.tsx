import type { Metadata } from "next";

export const metadata: Metadata = { title: "Leave Requests" };

export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
