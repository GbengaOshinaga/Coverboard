/**
 * Members (MEMBER role) cannot use these areas. The sidebar omits matching
 * items; middleware sends direct URL hits to /dashboard.
 */
export const MEMBER_FORBIDDEN_PATH_PREFIXES = ["/reports", "/audit"] as const;

export function isPathnameForbiddenForMember(pathname: string): boolean {
  return MEMBER_FORBIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Nav `href` values hidden for MEMBER — keep aligned with forbidden prefixes. */
export const MEMBER_HIDDEN_NAV_HREFS: readonly string[] = [
  "/reports",
  "/audit",
];
