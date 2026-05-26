import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StorageEngine {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Development mode metrics and logging wrapper
const logDevMetrics = (operation: string, key: string, startTime: number, sizeBytes?: number) => {
  // Silent background storage metrics
};

export const storageEngine: StorageEngine = {
  async getItem(key: string): Promise<string | null> {
    const startTime = performance.now();
    try {
      const val = await AsyncStorage.getItem(key);
      logDevMetrics('GET', key, startTime, val ? val.length : 0);
      return val;
    } catch (error) {
      console.error(`[StorageEngine Error] Failed to read key "${key}" from storage:`, error);
      // Corruption recovery fallback: Return null rather than crashing app startup
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const startTime = performance.now();
    try {
      // Validate that value is a string and fits criteria
      if (typeof value !== 'string') {
        throw new Error(`Serialization Guard: value must be a string, got ${typeof value}`);
      }
      await AsyncStorage.setItem(key, value);
      logDevMetrics('SET', key, startTime, value.length);
    } catch (error) {
      console.error(`[StorageEngine Error] Failed to write key "${key}" to storage:`, error);
      // Fail gracefully: do not bubble up crash
    }
  },

  async removeItem(key: string): Promise<void> {
    const startTime = performance.now();
    try {
      await AsyncStorage.removeItem(key);
      logDevMetrics('REMOVE', key, startTime);
    } catch (error) {
      console.error(`[StorageEngine Error] Failed to remove key "${key}" from storage:`, error);
      // Fail gracefully
    }
  },
};
