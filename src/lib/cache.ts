import * as SecureStore from 'expo-secure-store';

const PREFIX = 'cache_';

export const cacheStorage = {
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await SecureStore.setItemAsync(`${PREFIX}${key}`, JSON.stringify(value));
    } catch {
      // Non-fatal if secure store fails
    }
  },

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await SecureStore.getItemAsync(`${PREFIX}${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(`${PREFIX}${key}`);
    } catch {
      // ignore
    }
  },
};

export function cacheKey(parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join('_');
}
