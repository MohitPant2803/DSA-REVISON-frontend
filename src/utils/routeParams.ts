/** Normalize Expo Router params that may be string | string[]. */
export function normalizeParam(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}
