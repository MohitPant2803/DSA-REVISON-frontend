import { NativeModules, Platform } from 'react-native';

export async function isNetworkConnected(): Promise<boolean> {
  // 1. Web platform check
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  // 2. Safe check: Only require NetInfo if the native module is actually present
  const hasNetInfo = !!(NativeModules && NativeModules.RNCNetInfo);

  if (hasNetInfo) {
    try {
      const NetInfo = require('@react-native-community/netinfo').default;
      const state = await NetInfo.fetch();
      if (state && typeof state.isConnected === 'boolean') {
        return state.isConnected && state.isInternetReachable !== false;
      }
    } catch (err) {
      // Safe fallback
    }
  }

  // 3. Fallback to a fast, lightweight pure-JS fetch ping (600ms timeout)
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 600);
    const response = await fetch('https://1.1.1.1', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(id);
    return response.status >= 200 && response.status < 400;
  } catch (e) {
    return false; // Connection failed or aborted, assume offline
  }
}
