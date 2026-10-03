import { recentCoverAnswers } from "@/lib/cover-offers";
import { CoverUpdatesList } from "./cover-updates-list";

/**
 * Managers: what's happened to the cover they asked for in the last 7 days.
 * The in-app counterpart to the answer emails. Renders nothing when quiet.
 */
export async function CoverUpdates({ managerId, organizationId }: { managerId: string; organizationId: string }) {
  const answers = await recentCoverAnswers(managerId, organizationId);
  if (answers.length === 0) return null;
  return <CoverUpdatesList answers={answers} />;
}
