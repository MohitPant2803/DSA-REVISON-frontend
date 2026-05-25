import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'cache_';

export const cacheStorage = {
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn('[Cache Storage] AsyncStorage write failure:', e);
    }
  },

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(`${PREFIX}${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${PREFIX}${key}`);
    } catch {
      // ignore
    }
  },
};

export function cacheKey(parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join('_');
}
