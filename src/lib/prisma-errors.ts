/**
 * True when Prisma failed because a model/table is missing (migration not applied).
 */
export function isPrismaMissingTableError(
  error: unknown,
  modelName?: string
): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "P2021" || e.code === "P2022") return true;
  if (modelName && typeof e.message === "string") {
    return e.message.includes(modelName);
  }
  return false;
}
