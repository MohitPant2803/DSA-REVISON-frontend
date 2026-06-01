# Phase 2: Remaining Implementation Work

## Quick Reference for Developers

This document guides the remaining modifications needed to complete the SQLite architecture refactor.

---

## 1. File: `src/utils/syncManager.ts`

### Change 1: Import Write Manager and Differ
**Location:** Top of file (around line 1-30)

```typescript
import { sqliteWriteManager } from './sqliteWriteManager';
import { incrementalDiffer } from './incrementalDiffer';
import { syncPerformanceTracker } from './syncPerformanceTracker';
```

### Change 2: Replace Concurrent Promise.all() with Sequential Write Manager Calls
**Location:** Around line 583-585

**BEFORE:**
```typescript
await Promise.all([
  acceptedFolders.length > 0 ? saveFoldersToSQLite(acceptedFolders, activeUserId) : Promise.resolve(),
  acceptedPlaylists.length > 0 ? savePlaylistsToSQLite(acceptedPlaylists, activeUserId) : Promise.resolve(),
  finalAcceptedCards.length > 0 ? saveCardsToSQLite(finalAcceptedCards, activeUserId) : Promise.resolve(),
]);
```

**AFTER:**
```typescript
// Use serialized write manager instead of concurrent Promise.all()
if (acceptedFolders.length > 0) {
  await sqliteWriteManager.enqueue({
    id: `sync-folders-${Date.now()}`,
    type: 'folders',
    userId: activeUserId,
    data: acceptedFolders,
    timestamp: Date.now(),
    priority: 'normal',
  });
}

if (acceptedPlaylists.length > 0) {
  await sqliteWriteManager.enqueue({
    id: `sync-playlists-${Date.now()}`,
    type: 'playlists',
    userId: activeUserId,
    data: acceptedPlaylists,
    timestamp: Date.now(),
    priority: 'normal',
  });
}

if (finalAcceptedCards.length > 0) {
  await sqliteWriteManager.enqueue({
    id: `sync-cards-${Date.now()}`,
    type: 'cards',
    userId: activeUserId,
    data: finalAcceptedCards,
    timestamp: Date.now(),
    priority: 'normal',
    dedupeKey: `sync-cards-${activeUserId}`, // Coalesce rapid delta syncs
  });
}
```

### Change 3: Add Performance Tracking
**Location:** Around the existing sync try-catch (wrap the main sync logic)

```typescript
const startSync = Date.now();
const phaseId = syncPerformanceTracker.startPhase('Delta Sync');

try {
  // ... existing sync logic ...
  
  syncPerformanceTracker.endPhase(phaseId, 'completed', {
    cards: finalAcceptedCards.length,
    folders: acceptedFolders.length,
    playlists: acceptedPlaylists.length,
  });
} catch (err) {
  syncPerformanceTracker.endPhase(phaseId, 'failed', {}, err?.message);
  throw err;
}
```

### Change 4: Implement Checksum Mismatch with Incremental Diffing (Optional, Advanced)
**Location:** If checksum validation exists in syncManager

```typescript
// Before full resync, try incremental patching
const checksumMismatch = calculatedChecksum !== remoteChecksum;
if (checksumMismatch) {
  const diff = incrementalDiffer.generateDiffReport(
    {
      cards: store.cardsById,
      folders: store.foldersById,
      playlists: store.playlistsById,
    },
    {
      cards: payload.delta?.cards || [],
      folders: payload.delta?.folders || [],
      playlists: payload.delta?.playlists || [],
    },
    {
      cards: deletedCardIds,
      folders: deletedFolderIds,
      playlists: deletedPlaylistIds,
    }
  );

  if (!diff.shouldFallbackToFullResync) {
    // Apply incremental patches instead of full resync
    const patched = incrementalDiffer.applyIncrementalPatches(...);
    // Update state and write only changed entities
    store.setState({ cardsById: patched.cards, ... });
  } else {
    // Fall back to full resync only if too many changes
    await executeFullResync();
  }
}
```

---

## 2. File: `src/store/usePlaylistStateStore.ts`

### Change 1: Import Write Manager
**Location:** Top of file (imports section)

```typescript
import { sqliteWriteManager } from '@/utils/sqliteWriteManager';
```

### Change 2: Replace Individual saveXToSQLite Calls
**Location:** Every place where a user action calls saveCardsToSQLite, saveFoldersToSQLite, or savePlaylistsToSQLite

**Pattern:** Find these lines:
```typescript
await saveCardsToSQLite([card], userId);
await saveFoldersToSQLite([folder], userId);
await savePlaylistsToSQLite([playlist], userId);
```

**Replace with (example for card classification):**
```typescript
await sqliteWriteManager.enqueue({
  id: `classify-${cardId}-${Date.now()}`,
  type: 'cards',
  userId: userId,
  data: [updatedCard],
  timestamp: Date.now(),
  priority: 'critical',
  dedupeKey: `card:${userId}:${cardId}`, // Coalesce rapid changes to same card
});
```

### Common Actions to Update:
1. **Classification (CLASSIFY_CARD)**
   - `dedupeKey: "card:{userId}:{cardId}"`
   - `priority: 'critical'`

2. **Favorite Toggle (TOGGLE_FAVORITE)**
   - `dedupeKey: "card:{userId}:{cardId}"`
   - `priority: 'critical'`

3. **Playlist Operations (CREATE_PLAYLIST, UPDATE_PLAYLIST, DELETE_PLAYLIST)**
   - `dedupeKey: "playlist:{userId}:{playlistId}"`
   - `priority: 'normal'`

4. **Folder Operations (CREATE_FOLDER, UPDATE_FOLDER, DELETE_FOLDER)**
   - `dedupeKey: "folder:{userId}:{folderId}"`
   - `priority: 'normal'`

### Example Replacement (Classification):

**BEFORE:**
```typescript
const classifyCard = useCallback(async (cardId: string, state: string) => {
  // ... state update logic ...
  await saveCardsToSQLite([updatedCard], state.userId || 'guest-user');
}, []);
```

**AFTER:**
```typescript
const classifyCard = useCallback(async (cardId: string, state: string) => {
  const userId = state.userId || 'guest-user';
  const cleanId = cardId.split('-loop-')[0];
  
  // ... state update logic ...
  
  await sqliteWriteManager.enqueue({
    id: `classify-${cardId}`,
    type: 'cards',
    userId: userId,
    data: [updatedCard],
    timestamp: Date.now(),
    priority: 'critical',
    dedupeKey: `card:${userId}:${cleanId}`, // Coalesce rapid classifications
  });
}, []);
```

---

## 3. File: `src/utils/sqliteSyncBridge.ts` (OPTIONAL)

### Audit for Nested Transactions
**Search for:** `withTransactionAsync` inside `withTransactionAsync`

**Example Location:** `rotateQueueEncryptionKey()` function

**Check if:**
```typescript
await db.withTransactionAsync(async () => {
  const rows = await db.getAllAsync(...);  // ✅ OK - READ inside transaction
  for (const row of rows) {
    await db.runAsync(...);  // ✅ OK - WRITE inside transaction
  }
});
```

**DON'T DO:**
```typescript
await db.withTransactionAsync(async () => {
  // Some code
  await db.withTransactionAsync(async () => {  // ❌ NESTED TRANSACTION!
    // More code
  });
});
```

If you find nested transactions, move the inner one outside or use direct `runAsync()` inside the outer transaction.

---

## 4. Testing Checklist

### Unit Tests
- [ ] Write manager serialization (one transaction at a time)
- [ ] Coalescing dedupe logic (last write wins)
- [ ] Incremental differ accuracy
- [ ] Performance tracker metrics collection

### Integration Tests
- [ ] Reseeding doesn't trigger on version match
- [ ] Checksum mismatch uses incremental patching
- [ ] Full resync only on >30% changes
- [ ] User actions (classify, favorite) use write manager
- [ ] Zero transaction deadlocks
- [ ] Zero WAL conflicts

### Performance Tests
- [ ] Startup time: <500ms
- [ ] Write latency: <100ms average
- [ ] Delta sync: <500ms
- [ ] Memory: no unbounded growth in queue

### Regression Tests
- [ ] All existing sync functionality works
- [ ] Offline mode works
- [ ] Conflict resolution works
- [ ] User state preserved after sync

---

## 5. Deployment Strategy

### Phase 2a: Deploy Changes (Non-Breaking)
1. Create new files (Write Manager, Differ, Tracker)
2. Deploy to canary users (5%)
3. Monitor for crashes, errors

### Phase 2b: Update syncManager.ts (Low Risk)
1. Add write manager calls
2. Deploy to canary
3. Monitor sync success rate

### Phase 2c: Update usePlaylistStateStore.ts (Higher Risk)
1. Update user action writes
2. Feature flag: fall back to old behavior if issues
3. Gradual rollout: 10% → 25% → 50% → 100%

### Phase 2d: Remove Feature Flags
1. After 2 weeks of stable performance
2. Remove fallback code
3. Cleanup old transaction patterns

---

## 6. Validation Commands

```typescript
// Check if write manager is working
const metrics = sqliteWriteManager.getMetrics();
console.log('Write Manager Metrics:', metrics);
// Expected: totalOps > 0, coalescedOps > 0, errorCount === 0

// Check performance metrics
const report = syncPerformanceTracker.getDetailedReport();
console.log('Performance Report:', report);
// Expected: totalDuration < 1000ms, failedPhases === 0

// Print beautiful summary
syncPerformanceTracker.logSummary();
// Expected: All phases < 200ms
```

---

## 7. Common Gotchas

### Gotcha 1: Forgetting dedupeKey
If you don't set `dedupeKey`, rapid updates won't coalesce. User clicks 10 times → 10 writes.
Always set `dedupeKey` for user-triggered actions.

### Gotcha 2: Wrong Priority
Use `'critical'` for immediate actions (classify, favorite).
Use `'normal'` for background sync.
Use `'low'` for nice-to-have operations.

### Gotcha 3: Not Awaiting Write Manager
If you don't await the write manager call, state updates before write completes!
Always: `await sqliteWriteManager.enqueue(...)`

### Gotcha 4: Mixing Old and New Write Patterns
Don't mix `saveCardsToSQLite()` with `sqliteWriteManager.enqueue()` in same function.
Choose one pattern per file.

### Gotcha 5: Not Testing Coalescing
Test rapid user interaction:
```typescript
// Simulate rapid clicks
for (let i = 0; i < 10; i++) {
  classifyCard(cardId, 'easy');
  await new Promise(r => setTimeout(r, 50)); // 50ms apart
}

// Check metrics: coalescedOps should be ~9, totalOps should be ~1
const metrics = sqliteWriteManager.getMetrics();
console.assert(metrics.coalescedOps >= 8, 'Coalescing not working!');
```

---

## 8. Success Criteria

After Phase 2 implementation:
- ✅ All tests pass (unit, integration, regression)
- ✅ Startup time: <500ms
- ✅ Delta sync: <500ms
- ✅ Write latency: <100ms
- ✅ Zero deadlock errors in logs
- ✅ Zero WAL corruption errors
- ✅ 100% sync success rate
- ✅ No user-facing stalls

---

## Need Help?

1. Check `SQLITE_ARCHITECTURE_REFACTOR.md` for full context
2. Review `useSyncEngine.ts` for reference implementation
3. Look at existing write manager calls for patterns
4. Check performance tracker logs for metrics
