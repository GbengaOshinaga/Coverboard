const BLOCKED_KEYS = new Set([
  "email",
  "name",
  "note",
  "sicknessnote",
  "sickness_note",
  "password",
  "token",
  "ipaddress",
  "ip_address",
  "useragent",
  "user_agent",
]);

/** Strip keys that may hold PII before sending to product analytics. */
export function sanitizeAnalyticsProperties(
  properties?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!properties) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (BLOCKED_KEYS.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
