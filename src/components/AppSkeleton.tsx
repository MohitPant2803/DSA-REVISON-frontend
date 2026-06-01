import React from 'react';
import { View, StyleSheet } from 'react-native';

export function AppSkeleton() {
  // Clean white screen — no skeleton shapes or pulsing animations.
  // Matches the splash screen and app background for a seamless startup.
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F7',
  },
});
