import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { usePlaylistStateStore } from '../store/usePlaylistStateStore';
import { useShallow } from 'zustand/react/shallow';
import { CheckCircle2, RefreshCw, CloudOff } from 'lucide-react-native';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

export function SyncIndicator() {
  const palette = useThemePalette();
  const { syncStatus, offlineActionQueue, triggerSync } = usePlaylistStateStore(
    useShallow((s) => ({
      syncStatus: s.syncStatus,
      offlineActionQueue: s.offlineActionQueue,
      triggerSync: s.triggerSync,
    }))
  );

  const pendingCount = offlineActionQueue.length;

  const handlePress = () => {
    console.log('[SyncIndicator] Manually triggering background sync...');
    triggerSync();
  };

  let iconColor = palette.success; // Green (palette.success)
  let statusText = 'Synced';
  let IconComponent = CheckCircle2;
  let showLoader = false;

  if (syncStatus === 'syncing') {
    iconColor = palette.accent; // Violet/Accent
    statusText = 'Syncing...';
    IconComponent = RefreshCw;
    showLoader = true;
  } else if (syncStatus === 'offline' || pendingCount > 0) {
    iconColor = palette.warning; // Orange/Warning
    statusText = pendingCount > 0 ? `${pendingCount} Pending` : 'Offline';
    IconComponent = CloudOff;
  }

  return (
    <Pressable 
      onPress={handlePress} 
      style={[
        styles.container, 
        { 
          backgroundColor: addAlpha(palette.textPrimary, 0.04), 
          borderColor: palette.border 
        }
      ]}
    >
      <View style={styles.statusRow}>
        <View style={[styles.indicator, { backgroundColor: iconColor }]} />
        {showLoader ? (
          <ActivityIndicator size="small" color={iconColor} style={styles.loader} />
        ) : (
          <IconComponent size={14} color={iconColor} style={styles.icon} />
        )}
        <Text style={[styles.text, { color: iconColor }]}>
          {statusText}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  icon: {
    marginRight: 4,
  },
  loader: {
    marginRight: 4,
    transform: [{ scale: 0.8 }],
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
