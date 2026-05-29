import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { usePlaylistStateStore } from '../store/usePlaylistStateStore';
import { useShallow } from 'zustand/react/shallow';
import { LucideIcon, Cloud, CloudOff, CloudLightning, RefreshCw, CheckCircle2 } from 'lucide-react-native';

export function SyncIndicator() {
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

  let iconColor = '#10B981'; // Green
  let statusText = 'Synced';
  let IconComponent = CheckCircle2;
  let showLoader = false;

  if (syncStatus === 'syncing') {
    iconColor = '#8B5CF6'; // Violet
    statusText = 'Syncing...';
    IconComponent = RefreshCw;
    showLoader = true;
  } else if (syncStatus === 'offline' || pendingCount > 0) {
    iconColor = '#F59E0B'; // Orange
    statusText = pendingCount > 0 ? `${pendingCount} Pending` : 'Offline';
    IconComponent = CloudOff;
  }

  return (
    <Pressable onPress={handlePress} style={styles.container}>
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
