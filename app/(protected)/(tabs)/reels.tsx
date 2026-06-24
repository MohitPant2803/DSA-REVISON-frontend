"use no compiler";
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, InteractionManager } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ReeWCharacter } from '@/components/ReeWCharacter';

const { width, height } = Dimensions.get('window');

// Cache the component after it is loaded
let cachedCoreComponent: React.ComponentType<any> | null = null;
let reelsCorePromise: Promise<React.ComponentType<any>> | null = null;

const getReelsCore = () => {
  if (cachedCoreComponent) {
    return Promise.resolve(cachedCoreComponent);
  }
  if (!reelsCorePromise) {
    reelsCorePromise = import('@/components/reels_core').then(m => {
      cachedCoreComponent = m.default;
      return m.default;
    });
  }
  return reelsCorePromise;
};

// Export preloading function to call it from Tab Layout at startup
export const preloadReelsCore = () => {
  getReelsCore().catch(err => {
    console.warn('[PERF] Preloading reels_core failed:', err);
  });
};

// Performance tracking anchor
let tabOpenTimestamp = 0;

export default function ReelsScreen(props: any) {
  const [CoreComponent, setCoreComponent] = useState<React.ComponentType<any> | null>(() => cachedCoreComponent);
  const [showLoader] = useState(() => !cachedCoreComponent);

  // Monitor screen focus to track perceived visual response time
  useFocusEffect(
    React.useCallback(() => {
      tabOpenTimestamp = performance.now();
      console.log('[PERF] Reels tab opened/focused at:', tabOpenTimestamp);
      return () => {};
    }, [])
  );

  useEffect(() => {
    if (CoreComponent) {
      // Warm switch / already loaded
      const responseTime = performance.now() - tabOpenTimestamp;
      console.log(`[PERF] Warm switch - Reels Core rendered in ${responseTime.toFixed(2)}ms (zero loader)`);
      return;
    }

    let active = true;
    const startTimestamp = performance.now();

    // Defer the heavy import evaluation to let the transition paint first
    const timer = setTimeout(() => {
      if (!active) return;
      
      console.log('[PERF] Defer timeout complete. Importing reels_core...');
      getReelsCore().then(comp => {
        if (active) {
          setCoreComponent(() => comp);
          const loadDuration = performance.now() - startTimestamp;
          const totalVisualTime = performance.now() - tabOpenTimestamp;
          console.log(`[PERF] Cold start - reels_core import resolved in ${loadDuration.toFixed(2)}ms. Total visual transition: ${totalVisualTime.toFixed(2)}ms`);
        }
      }).catch(err => {
        console.error('[PERF] Error loading reels_core:', err);
      });
    }, 100);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [CoreComponent]);

  if (CoreComponent) {
    const Component = CoreComponent;
    return <Component {...props} />;
  }

  // Cold start fallback: Render the premium lightweight loading screen with animated mascot instantly
  return (
    <View style={styles.container} pointerEvents="none">
      <ReeWCharacter state="loading" size={140} disableIdleCycle={true} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF9F7', // Palette background color
  },
  blankContainer: {
    flex: 1,
    backgroundColor: '#FAF9F7',
  },
});
