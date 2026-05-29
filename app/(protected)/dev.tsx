import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useAuthStore } from '@/store/useAuthStore';
import { syncManager } from '@/utils/syncManager';

export default function DevReplayInspector() {
  const { offlineActionQueue, poisonActionIds, logicalClockSequence, removeProcessedActions } = usePlaylistStateStore();
  const { sessionGenerationId, user } = useAuthStore();
  const syncState = syncManager.getSyncState();

  const handleForceSync = () => {
    syncManager.sync(true);
  };

  const handleClearDLQ = () => {
    // Only clears poison actions if the server has ACKed them. For dev, we just pop them.
    if (poisonActionIds.length > 0) {
      removeProcessedActions(poisonActionIds);
      usePlaylistStateStore.setState({ poisonActionIds: [] });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Replay Inspector</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sync Engine State</Text>
          <Text style={styles.text}>Status: {syncState}</Text>
          <Text style={styles.text}>User ID: {user?.id || 'guest'}</Text>
          <Text style={styles.text}>Local Clock Sequence: {logicalClockSequence}</Text>
          <Text style={styles.text}>Hydration Gen: {sessionGenerationId}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Offline Action Queue ({offlineActionQueue.length})</Text>
          {offlineActionQueue.map((action) => (
            <View key={action.id} style={styles.actionItem}>
              <Text style={styles.actionText}>{action.action} (Retry: {action.retryCount || 0})</Text>
              <Text style={styles.actionSubText}>{JSON.stringify(action.payload)}</Text>
            </View>
          ))}
          {offlineActionQueue.length === 0 && <Text style={styles.text}>Queue is empty.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dead Letter Queue ({poisonActionIds.length})</Text>
          {poisonActionIds.map((id) => (
            <View key={id} style={styles.actionItem}>
              <Text style={styles.actionText}>Poison ID: {id}</Text>
            </View>
          ))}
          {poisonActionIds.length === 0 && <Text style={styles.text}>DLQ is empty.</Text>}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={handleForceSync}>
            <Text style={styles.buttonText}>Force Sync</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={handleClearDLQ}>
            <Text style={styles.buttonText}>Clear DLQ</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.button, { marginTop: 16, backgroundColor: '#8b5cf6' }]} 
          onPress={() => {
            try {
              const { getDatabase } = require('@/utils/sqliteDatabase');
              const db = getDatabase();
              db.runSync('DELETE FROM deleted_entities;');
              db.runSync("DELETE FROM playlists WHERE id IN ('easy', 'medium', 'hard', 'skipped') OR LOWER(name) IN ('easy', 'medium', 'hard', 'skipped', 'dp', 'yus', 'testing', 'lesgoooo', 'lessgoooo');");
              console.log('[Dev Tools] Successfully cleared SQLite database tables.');
              
              // Wipe from Zustand memory cache instantly
              const store = usePlaylistStateStore.getState();
              const playlistsById = { ...store.playlistsById };
              const orderMap = { ...store.playlistCardOrderMap };
              
              const systemAndStaleNames = ['easy', 'medium', 'hard', 'skipped', 'dp', 'yus', 'testing', 'lesgoooo', 'lessgoooo'];
              
              Object.keys(playlistsById).forEach((key) => {
                const name = playlistsById[key]?.name?.toLowerCase() || '';
                if (systemAndStaleNames.includes(key) || systemAndStaleNames.includes(name)) {
                  delete playlistsById[key];
                  delete orderMap[key];
                }
              });
              
              usePlaylistStateStore.setState({
                playlistsById,
                playlistCardOrderMap: orderMap,
                lastSyncedRevision: 0,
              });
              
              syncManager.sync(true);
            } catch (err: any) {
              console.error('[Dev Tools Error] Failed to clear tombstones:', err.message);
            }
          }}
        >
          <Text style={styles.buttonText}>Clear Tombstones & Force Full Resync</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  headerText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  scroll: { padding: 16 },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 8, marginBottom: 16 },
  sectionTitle: { color: '#38bdf8', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  text: { color: '#cbd5e1', marginBottom: 4 },
  actionItem: { backgroundColor: '#334155', padding: 8, borderRadius: 4, marginBottom: 8 },
  actionText: { color: 'white', fontWeight: 'bold' },
  actionSubText: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, flex: 1, marginRight: 8, alignItems: 'center' },
  buttonDanger: { backgroundColor: '#ef4444', marginRight: 0, marginLeft: 8 },
  buttonText: { color: 'white', fontWeight: 'bold' }
});
