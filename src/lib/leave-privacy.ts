/**
 * Why a colleague is off is personal: sickness is health data under UK GDPR
 * (Article 9), and parental or neonatal leave says as much. Staff see
 * colleagues as "Away", in one neutral colour so the colour can't give the
 * type away either. Admins and managers, who approve leave, see the type, and
 * everyone sees their own.
 */
export const AWAY_LEAVE_TYPE = { name: "Away", color: "#9CA3AF" } as const;

export function canSeeLeaveReasons(role: unknown): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function leaveTypeSeenBy<T extends { name: string; color?: string }>(
  leaveType: T,
  viewer: { id: unknown; role: unknown },
  ownerId: string
): T | typeof AWAY_LEAVE_TYPE {
  if (canSeeLeaveReasons(viewer.role) || viewer.id === ownerId) return leaveType;
  return AWAY_LEAVE_TYPE;
}
