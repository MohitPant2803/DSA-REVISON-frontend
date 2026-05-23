// import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/services/api';

/**
 * Preheats the network connection and background states to optimize startup time.
 */
export async function preheatNetwork(): Promise<void> {
  try {
    // Fire a lightweight ping to wake up a serverless/containerized backend
    // and resolve TCP handshakes early
    await api.get('/auth/me').catch(() => {
      // Catch errors gracefully as this is just a preheat ping
    });
  } catch (e) {
    // Silent catch to prevent startup crashes on offline states
  }
}

/**
 * Preloads all essential graphics and fonts required for the onboarding and app splash.
 */
export async function preloadStaticAssets(): Promise<void> {
  try {
    // 1. Preload any locally bundled image assets if configured in future
    const images: number[] = [];
    const cacheImages = images.map((image) => {
      return Promise.resolve();
    });

    // 2. Preload system fonts or custom styles
    const fontLoading = Font.loadAsync({
      // Hook up any system fonts or Lucide icons needed early
    });

    await Promise.all([...cacheImages, fontLoading]);
  } catch (e) {
    console.warn('Asset preloading warning (non-fatal):', e);
  }
}

/**
 * Triggers optimistic background queries for playlists and reels if the session is authenticated.
 * This runs in parallel with the cinematic splash animation.
 */
export function startOptimisticDataPreload(): void {
  const { isAuthenticated, user } = useAuthStore.getState();
  const isGuest = user?.id === 'guest-user';

  if (!isAuthenticated && !isGuest) return;

  // Optimistically fire requests so that react-query/axios cache is primed by the time transition finishes
  try {
    // Preload folders/playlists
    api.get('/folders').catch(() => {});
    api.get('/playlists').catch(() => {});

    // Preload initial revisions feed (reels)
    api.get('/revisions/feed', { params: { limit: 10 } }).catch(() => {});
  } catch (error) {
    // Silent catch, data will fall back to normal fetch on tab load
  }
}
