import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useAuthStore } from '@/store/useAuthStore';
import { syncManager } from '@/utils/syncManager';
import { sqliteWriteManager } from '@/utils/sqliteWriteManager';
import { syncPerformanceTracker } from '@/utils/syncPerformanceTracker';

export default function DevReplayInspector() {
  const { offlineActionQueue, poisonActionIds, logicalClockSequence, removeProcessedActions } = usePlaylistStateStore();
  const { sessionGenerationId, user } = useAuthStore();
  const syncState = syncManager.getSyncState();

  const [metrics, setMetrics] = React.useState(sqliteWriteManager.getMetrics());
  const [testResult, setTestResult] = React.useState<string | null>(null);

  // Poll metrics every 1 second to update screen
  React.useEffect(() => {
    const timer = setInterval(() => {
      setMetrics(sqliteWriteManager.getMetrics());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const startupMetrics = syncPerformanceTracker.getStartupMetrics();

  const handleTestCoalescing = async () => {
    setTestResult('Running coalescing test...');
    try {
      const store = usePlaylistStateStore.getState();
      const userId = store.userId || 'guest-user';
      const initialMetrics = sqliteWriteManager.getMetrics();
      const cardId = `test-coalesce-${Date.now()}`;

      // Enqueue 5 rapid card writes with the same dedupeKey
      for (let i = 0; i < 5; i++) {
        await sqliteWriteManager.enqueue({
          id: `test-coalesce-${i}-${Date.now()}`,
          type: 'cards',
          userId,
          data: [{
            _id: cardId,
            title: `Coalesced Card Test ${i}`,
            topic: 'Testing',
            difficulty: 'Easy',
            updatedAt: new Date().toISOString(),
          }],
          timestamp: Date.now(),
          priority: 'critical',
          dedupeKey: `card:${userId}:${cardId}`,
        });
        // 10ms gap between enqueues to simulate rapid successive clicks
        await new Promise(r => setTimeout(r, 10));
      }

      // Wait for the coalescing window (300ms) + processing time (150ms)
      await new Promise(r => setTimeout(r, 450));

      const finalMetrics = sqliteWriteManager.getMetrics();
      const opsCoalesced = finalMetrics.coalescedOps - initialMetrics.coalescedOps;

      if (opsCoalesced >= 4) {
        setTestResult(`✅ PASSED: Coalesced ${opsCoalesced} of 5 rapid write operations into 1 physical transaction!`);
      } else {
        setTestResult(`❌ FAILED: Coalesced ${opsCoalesced} operations (expected >= 4).`);
      }
    } catch (err: any) {
      setTestResult(`❌ ERROR: ${err.message}`);
    }
  };

  const handleForceSync = () => {
    syncManager.sync(true);
  };

  const handleClearDLQ = () => {
    if (poisonActionIds.length > 0) {
      removeProcessedActions(poisonActionIds);
      usePlaylistStateStore.setState({ poisonActionIds: [] });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Replay & Performance Inspector</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        
        {/* 1. Write Manager Metrics Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>⚡ SQLite Single-Writer Performance</Text>
          
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Total Writes</Text>
              <Text style={styles.metricValue}>{metrics.totalOps}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Coalesced</Text>
              <Text style={styles.metricValue}>{metrics.coalescedOps}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Errors</Text>
              <Text style={[styles.metricValue, metrics.errorCount > 0 && { color: '#ef4444' }]}>{metrics.errorCount}</Text>
            </View>
          </View>

          <View style={[styles.metricsGrid, { marginTop: 10 }]}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Avg Queue Wait</Text>
              <Text style={styles.metricValue}>{metrics.queueWaitMs.toFixed(1)}ms</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Max Tx Duration</Text>
              <Text style={styles.metricValue}>{metrics.transactionMs.toFixed(1)}ms</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Coalesce Rate</Text>
              <Text style={styles.metricValue}>
                {metrics.totalOps > 0 ? `${((metrics.coalescedOps / (metrics.totalOps + metrics.coalescedOps)) * 100).toFixed(0)}%` : '0%'}
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Startup Phase Timings Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>⏱️ Startup & Sync Phase Durations</Text>
          {startupMetrics ? (
            <View style={styles.timingList}>
              <Text style={styles.text}>🚀 Cold Start Duration: <Text style={styles.boldText}>{startupMetrics.coldStartMs}ms</Text></Text>
              <Text style={styles.text}>🌱 Bootstrap Seeding: <Text style={styles.boldText}>{startupMetrics.bootstrapMs ? `${startupMetrics.bootstrapMs}ms` : 'Skipped (Version Match)'}</Text></Text>
              <Text style={styles.text}>🔄 First Delta Sync: <Text style={styles.boldText}>{startupMetrics.firstDeltaSyncMs ? `${startupMetrics.firstDeltaSyncMs}ms` : '0ms'}</Text></Text>
              <Text style={styles.text}>✨ App Ready Duration: <Text style={styles.boldText}>{startupMetrics.appReadyMs}ms</Text></Text>
            </View>
          ) : (
            <Text style={styles.text}>Calculating startup metrics...</Text>
          )}

          <TouchableOpacity 
            style={[styles.button, { marginTop: 12, backgroundColor: '#10b981' }]} 
            onPress={() => syncPerformanceTracker.logSummary()}
          >
            <Text style={styles.buttonText}>Log Full Metrics to Console</Text>
          </TouchableOpacity>
        </View>

        {/* 3. Automated Verification Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>🔬 Automated Verification</Text>
          <Text style={[styles.text, { marginBottom: 12 }]}>
            Verify the micro-coalescing and queue serialization features of the single-writer database by clicking below.
          </Text>
          
          {testResult && (
            <View style={styles.testResultBox}>
              <Text style={styles.testResultText}>{testResult}</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.button, { backgroundColor: '#f59e0b' }]} onPress={handleTestCoalescing}>
            <Text style={styles.buttonText}>Run Coalescing Test</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Sync State Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>🔄 Sync Engine State</Text>
          <Text style={styles.text}>Status: <Text style={styles.boldText}>{syncState}</Text></Text>
          <Text style={styles.text}>User ID: <Text style={styles.boldText}>{user?.id || 'guest'}</Text></Text>
          <Text style={styles.text}>Local Clock Sequence: <Text style={styles.boldText}>{logicalClockSequence}</Text></Text>
          <Text style={styles.text}>Hydration Gen: <Text style={styles.boldText}>{sessionGenerationId}</Text></Text>
        </View>

        {/* 5. Offline Queue Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>📂 Offline Action Queue ({offlineActionQueue.length})</Text>
          {offlineActionQueue.map((action) => (
            <View key={action.id} style={styles.actionItem}>
              <Text style={styles.actionText}>{action.action} (Retry: {action.retryCount || 0})</Text>
              <Text style={styles.actionSubText}>{JSON.stringify(action.payload)}</Text>
            </View>
          ))}
          {offlineActionQueue.length === 0 && <Text style={styles.text}>Queue is empty.</Text>}
        </View>

        {/* 6. DLQ Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>⚠️ Dead Letter Queue ({poisonActionIds.length})</Text>
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
          style={[styles.button, { marginTop: 16, marginBottom: 24, backgroundColor: '#8b5cf6' }]} 
          onPress={async () => {
            try {
              const { getDatabase } = require('@/utils/sqliteDatabase');
              const { invalidateDeletedEntitiesCache } = require('@/utils/sqliteSyncBridge');
              const db = getDatabase();
              
              // 1. Wipe all local SQLite content tables, tombstones, and cursors to force a clean full resync
              await db.runAsync('DELETE FROM cards_metadata;');
              await db.runAsync('DELETE FROM cards_content;');
              await db.runAsync('DELETE FROM deleted_entities;');
              await db.runAsync('DELETE FROM sync_cursors;');
              await db.runAsync("DELETE FROM playlists WHERE id IN ('easy', 'medium', 'hard', 'skipped') OR LOWER(name) IN ('easy', 'medium', 'hard', 'skipped', 'dp', 'yus', 'testing', 'lesgoooo', 'lessgoooo');");
              
              invalidateDeletedEntitiesCache();
              console.log('[Dev Tools] Successfully cleared SQLite database tables.');
              
              // 2. Wipe from Zustand memory cache instantly
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
                cardsById: {},
                lastSyncedRevision: 0,
                lastSyncedAt: null,
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
  headerText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  scroll: { padding: 16 },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 8, marginBottom: 16 },
  sectionTitle: { color: '#38bdf8', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  text: { color: '#cbd5e1', fontSize: 13, marginBottom: 4, lineHeight: 18 },
  boldText: { color: 'white', fontWeight: 'bold' },
  timingList: { gap: 4 },
  actionItem: { backgroundColor: '#334155', padding: 8, borderRadius: 4, marginBottom: 8 },
  actionText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  actionSubText: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, flex: 1, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  buttonDanger: { backgroundColor: '#ef4444', marginRight: 0, marginLeft: 8 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  metricsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  metricItem: { flex: 1, backgroundColor: '#334155', padding: 8, borderRadius: 6, alignItems: 'center', marginRight: 8 },
  metricLabel: { color: '#94a3b8', fontSize: 10, marginBottom: 4, fontWeight: '500' },
  metricValue: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  testResultBox: { backgroundColor: '#334155', padding: 10, borderRadius: 6, marginBottom: 12 },
  testResultText: { color: '#cbd5e1', fontWeight: '600', fontSize: 12, lineHeight: 16 }
});
