import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
  Vibration,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, LogOut, LogIn, Moon, Sun, CheckSquare, Square, Folder as FolderIcon } from 'lucide-react-native';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useGetFolders } from '@/hooks/useFolders';
import { useSyncEngine } from '@/hooks/useSyncEngine';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { syncManager } from '@/utils/syncManager';
import * as reelsFeedService from '@/services/reelsFeedService';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import api from '@/services/api';
import Toast from 'react-native-toast-message';


const { width, height } = Dimensions.get('window');

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(6);
  }
};

// -------------------------------------------------------------
// PREMIUM APPLE-STYLE SEGMENTED CONTROL
// -------------------------------------------------------------
interface SegmentedControlProps {
  options: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
}

export function SegmentedControl({ options, activeId, onChange }: SegmentedControlProps) {
  const activeIndex = options.findIndex(o => o.id === activeId);
  const slideValue = useSharedValue(activeIndex >= 0 ? activeIndex : 0);

  useEffect(() => {
    if (activeIndex >= 0) {
      slideValue.value = activeIndex;
    }
  }, [activeIndex]);

  const animatedStyle = useAnimatedStyle(() => {
    const segmentWidth = 100 / options.length;
    return {
      left: `${slideValue.value * segmentWidth}%`,
      width: `${segmentWidth}%`,
    };
  });

  return (
    <View style={segmentedStyles.container}>
      <Animated.View style={[segmentedStyles.pill, animatedStyle]} />
      {options.map((option) => {
        const isActive = option.id === activeId;
        return (
          <TouchableOpacity
            key={option.id}
            activeOpacity={0.85}
            onPress={() => {
              lightHaptic();
              onChange(option.id);
            }}
            style={segmentedStyles.segmentButton}
          >
            <Text style={[segmentedStyles.segmentText, isActive && segmentedStyles.segmentTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const segmentedStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(118, 118, 128, 0.08)',
    borderRadius: 16,
    padding: 3,
    position: 'relative',
    height: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    backgroundColor: '#ffffff',
    borderRadius: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: -0.1,
  },
  segmentTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
});

// -------------------------------------------------------------
// MY SPACE SETTINGS OVERLAY (Appearance & Auth Only)
// -------------------------------------------------------------
interface MySpaceSettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MySpaceSettingsOverlay = React.memo(({ isOpen, onClose }: MySpaceSettingsOverlayProps) => {
  const { preferences, updatePreference } = useUserPreferencesStore();
  const { user, login, logout } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { triggerBackgroundSync } = useSyncEngine();

  const [shouldRender, setShouldRender] = useState(isOpen);
  const backdropOpacity = useSharedValue(0);
  const sheetScale = useSharedValue(0.96);
  const sheetOpacity = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      backdropOpacity.value = 0.3;
      sheetScale.value = 1;
      sheetOpacity.value = 1;
    } else {
      backdropOpacity.value = 0;
      sheetScale.value = 0.96;
      sheetOpacity.value = 0;
      setShouldRender(false);
    }
  }, [isOpen]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sheetScale.value }],
    opacity: sheetOpacity.value,
  }));

  const handleClose = () => {
    lightHaptic();
    onClose();
  };

  const handleAuthAction = async () => {
    lightHaptic();
    if (isGuest) {
      try {
        setIsAuthenticating(true);
        await GoogleSignin.hasPlayServices();
        try {
          await GoogleSignin.signOut();
        } catch {}

        const userInfo = await GoogleSignin.signIn();

        if (userInfo.type === 'success') {
          const { idToken } = userInfo.data;
          if (!idToken) {
            throw new Error('Google Sign-In failed: No ID Token returned.');
          }

          console.log('[DEBUG] Google Sign-In Successful! Exchanging token with backend...');
          const res = await api.post('/auth/google', { idToken });
          const { token, user: rawUser } = res.data.data;

          const user = {
            id: rawUser._id,
            name: rawUser.name,
            email: rawUser.email,
            avatarUrl: rawUser.profilePicture,
            role: rawUser.role,
            totalSwipes: rawUser.totalSwipes || 0,
            totalScrolls: rawUser.totalScrolls || 0,
          };

          await login(token, user);
          onClose();
        }
      } catch (error: any) {
        console.log("FULL GOOGLE ERROR:", JSON.stringify(error, null, 2));
        if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
          console.error('Google Sign-In Error:', error);
        }
      } finally {
        setIsAuthenticating(false);
      }
    } else {
      onClose();
      await logout();
    }
  };

  return (
    <Modal visible={shouldRender} animationType="none" transparent onRequestClose={handleClose}>
      <View style={styles.fullscreen}>
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]} onTouchStart={handleClose} />
        
        <Animated.View style={[styles.mySpaceSheet, animatedSheetStyle]}>
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.8}>
              <X color="#64748B" size={14} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {/* Appearance Section */}
            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Appearance</Text>
              <SegmentedControl
                options={[
                  { id: 'light', label: 'Light Mode' },
                  { id: 'dark', label: 'Dark Mode' },
                ]}
                activeId={preferences.theme || 'light'}
                onChange={(id) => updatePreference('theme', id as 'light' | 'dark')}
              />
            </View>

            {/* Authentication Section */}
            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Account</Text>
              <TouchableOpacity
                onPress={handleAuthAction}
                activeOpacity={0.8}
                disabled={isAuthenticating}
                style={[
                  styles.authButton,
                  isGuest ? styles.authButtonSignIn : styles.authButtonSignOut
                ]}
              >
                {isAuthenticating ? (
                  <ActivityIndicator color="#ffffff" />
                ) : isGuest ? (
                  <>
                    <LogIn color="#ffffff" size={16} strokeWidth={2.2} style={{ marginRight: 8 }} />
                    <Text style={styles.authButtonTextSignIn}>Sign In</Text>
                  </>
                ) : (
                  <>
                    <LogOut color="#EF4444" size={16} strokeWidth={2.2} style={{ marginRight: 8 }} />
                    <Text style={styles.authButtonTextSignOut}>Sign Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Sync / Content Control Section */}
            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Sync</Text>
              <TouchableOpacity
                onPress={() => {
                  lightHaptic();
                  Alert.alert(
                    "Refresh Content",
                    "This will refresh all cards and folders from the local seeder.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Refresh",
                        onPress: async () => {
                          try {
                            // 1. Wipe all user-derived tables from SQLite
                            const activeUserId = useAuthStore.getState().user?.id || 'guest-user';
                            const { clearAllDataFromSQLite } = require('@/utils/sqliteSyncBridge');
                            clearAllDataFromSQLite(activeUserId);
                            
                            // 2. Wipe from Zustand memory cache instantly
                            usePlaylistStateStore.setState({
                              foldersById: {},
                              playlistsById: {},
                              cardsById: {},
                              playlistCardOrderMap: {
                                easy: [],
                                medium: [],
                                hard: [],
                                skipped: [],
                                likes: [],
                                'watch-later': [],
                                all: [],
                              },
                              cardDifficultyMap: {},
                              offlineActionQueue: [],
                              deadLetterQueue: [],
                              smartPlaylistDeltaCounts: { easy: 0, medium: 0, hard: 0, skipped: 0 },
                              initialSmartCounts: { easy: 0, medium: 0, hard: 0, skipped: 0 },
                              lastSyncedRevision: 0,
                              lastSyncedAt: null,
                              hydratedPlaylists: {},
                              fullPlaylistCards: {},
                              hydratedPlaylistCardCounts: {},
                            });

                            // 3. Trigger full background sync and local seed refresh
                            await triggerBackgroundSync(true);

                            Toast.show({
                              type: 'success',
                              text1: 'Content Refreshed',
                              text2: 'Stale collections cleared and database resynced.',
                            });
                            
                            onClose();
                          } catch (err) {
                            console.error('[Manual Refresh Error]', err);
                            Toast.show({
                              type: 'error',
                              text1: 'Refresh Failed',
                              text2: 'Please restart the app and try again.',
                            });
                          }
                        }
                      }
                    ]
                  );
                }}
                activeOpacity={0.8}
                style={[
                  styles.authButton,
                  {
                    backgroundColor: '#FAF9F7',
                    borderColor: 'rgba(148, 163, 184, 0.1)',
                    marginTop: 4,
                  }
                ]}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#64748B' }}>
                  Refresh Content
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});

// -------------------------------------------------------------
// REELS SETTINGS OVERLAY (Folder header, session timer, pills)
// -------------------------------------------------------------
interface ReelsSettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  playlistName: string;
  sessionTimer: string;
  questionsRevised: number;
  showReelContentSelect?: boolean;
}

export const ReelsSettingsOverlay = React.memo(({
  isOpen,
  onClose,
  playlistName,
  sessionTimer,
  questionsRevised,
  showReelContentSelect = true,
}: ReelsSettingsOverlayProps) => {
  const { preferences, updatePreference } = useUserPreferencesStore();
  const { currentMode, setMode, totalSwipes, totalScrolls } = useTrackingStore();
  const { user } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  const queryClient = useQueryClient();

  const { data: foldersData } = useGetFolders({ limit: 100 });
  const rootFolders = React.useMemo(() => {
    return foldersData?.results?.filter((f: any) => f.parentFolderId === null || !f.parentFolderId) || [];
  }, [foldersData]);

  const cardsById = usePlaylistStateStore((s) => s.cardsById);
  const foldersById = usePlaylistStateStore((s) => s.foldersById);

  const rootFoldersWithCounts = React.useMemo(() => {
    const directCardCounts = new Map<string, number>();
    Object.values(cardsById).forEach((card: any) => {
      const folderId = card.folderId ? card.folderId.toString() : null;
      if (folderId) {
        directCardCounts.set(folderId, (directCardCounts.get(folderId) || 0) + 1);
      }
    });

    const childrenMap = new Map<string, string[]>();
    Object.values(foldersById).forEach((f: any) => {
      if (f.parentFolderId) {
        const pId = f.parentFolderId.toString();
        const existing = childrenMap.get(pId) || [];
        existing.push(f._id.toString());
        childrenMap.set(pId, existing);
      }
    });

    const getDescendantFolderIds = (folderId: string): string[] => {
      const ids: string[] = [folderId];
      const queue: string[] = [folderId];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const children = childrenMap.get(curr) || [];
        children.forEach((child) => {
          if (!ids.includes(child)) {
            ids.push(child);
            queue.push(child);
          }
        });
      }
      return ids;
    };

    return rootFolders.map((rootFolder: any) => {
      const rootId = rootFolder._id.toString();
      const descendants = getDescendantFolderIds(rootId);
      
      let totalCards = 0;
      descendants.forEach((dId) => {
        totalCards += directCardCounts.get(dId) || 0;
      });

      return {
        ...rootFolder,
        cardCount: totalCards,
      };
    });
  }, [cardsById, foldersById, rootFolders]);

  const { data: prefsData } = useQuery({
    queryKey: ['reelPreferences'],
    queryFn: reelsFeedService.getReelPreferences,
    enabled: !isGuest,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(() => {
    return prefsData?.selectedRootFolderIds || [];
  });

  useEffect(() => {
    if (isOpen && prefsData?.selectedRootFolderIds) {
      setSelectedFolderIds(prefsData.selectedRootFolderIds);
    }
  }, [prefsData, isOpen]);

  const [prefSaving, setPrefSaving] = useState(false);
  const [customAlert, setCustomAlert] = useState<{ title: string; message: string } | null>(null);

  const handleToggleFolder = (folderId: string) => {
    if (isGuest) return;
    const isAlreadySelected = selectedFolderIds.includes(folderId);
    let nextSelected: string[];
    
    if (isAlreadySelected) {
      nextSelected = selectedFolderIds.filter(id => id !== folderId);
      if (nextSelected.length === 0) {
        setCustomAlert({
          title: 'Selection Locked',
          message: 'You must select at least one folder for study content.'
        });
        return;
      }
    } else {
      nextSelected = [...selectedFolderIds, folderId];
    }

    // Calculate total cards in the next selection
    const totalCardsInNextSelection = rootFoldersWithCounts
      .filter((f: any) => nextSelected.includes(f._id))
      .reduce((sum: number, f: any) => sum + (f.cardCount || 0), 0);

    if (totalCardsInNextSelection === 0) {
      setCustomAlert({
        title: 'Empty Selection Warning',
        message: 'Warning: The remaining selected folder(s) contain 0 cards. Please select folder with cards inside to study.'
      });
      return;
    }

    setSelectedFolderIds(nextSelected);
  };

  const handleSavePreferences = async () => {
    if (isGuest) {
      onClose();
      return;
    }
    
    try {
      setPrefSaving(true);
      
      // 1. Save folder content preferences to database
      const updatedPrefs = await reelsFeedService.updateReelPreferences(selectedFolderIds);
      
      // 2. Synchronously update query data cache to prevent closing state reverts
      queryClient.setQueryData(['reelPreferences'], updatedPrefs);
      
      // 3. Explicitly regenerate deterministic reels feed session on backend
      await reelsFeedService.regenerateReelQueue();

      // 4. Invalidate queries to refresh general reels deck and seen counts
      queryClient.invalidateQueries({ queryKey: ['reelsFeed'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['reelPreferences'] });
    } catch (err) {
      console.warn('[Prefs Save Warning] Failed to update preferences on server, closing overlay anyway:', err);
    } finally {
      setPrefSaving(false);
      onClose();
    }
  };

  const [shouldRender, setShouldRender] = useState(isOpen);
  const backdropOpacity = useSharedValue(0);
  const sheetScale = useSharedValue(0.96);
  const sheetOpacity = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      backdropOpacity.value = 0.3;
      sheetScale.value = 1;
      sheetOpacity.value = 1;
    } else {
      backdropOpacity.value = 0;
      sheetScale.value = 0.96;
      sheetOpacity.value = 0;
      setShouldRender(false);
    }
  }, [isOpen]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sheetScale.value }],
    opacity: sheetOpacity.value,
  }));

  const handleClose = () => {
    lightHaptic();
    onClose();
  };

  const isCodeMode = preferences.explanationFlowOrder[1] === 'code';

  return (
    <Modal visible={shouldRender} animationType="none" transparent onRequestClose={handleClose}>
      <View style={styles.fullscreen}>
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]} onTouchStart={handleClose} />

        <Animated.View style={[styles.reelsSheet, animatedSheetStyle]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.reelsHeaderTitle} numberOfLines={1}>
                {playlistName}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.8}>
              <X color="#64748B" size={14} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Session Stats Section */}
            <View style={styles.statsPanel}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Session Time</Text>
                <Text style={styles.statValue}>{sessionTimer}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>This Session</Text>
                <Text style={styles.statValue}>{questionsRevised}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total Revised</Text>
                <Text style={styles.statValue}>{totalSwipes + totalScrolls}</Text>
              </View>
            </View>

            {/* Content Mode */}
            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Content Focus</Text>
              <SegmentedControl
                options={[
                  { id: 'concept', label: 'Concept' },
                  { id: 'code', label: 'Code' },
                ]}
                activeId={isCodeMode ? 'code' : 'concept'}
                onChange={(id) => {
                  if (id === 'code') {
                    updatePreference('explanationFlowOrder', ['intro', 'code', 'dryrun', 'summary', 'complexity', 'visualization']);
                  } else {
                    updatePreference('explanationFlowOrder', ['intro', 'explanation', 'intuition', 'dryrun', 'complexity', 'visualization', 'code', 'summary']);
                  }
                }}
              />
            </View>

            {/* AI Assistant Mode */}
            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>AI Assistant Mode</Text>
              <SegmentedControl
                options={[
                  { id: 'explanation', label: 'Explain This' },
                  { id: 'quiz', label: 'Test Me' },
                ]}
                activeId={preferences.gptPromptMode || 'explanation'}
                onChange={(id) => updatePreference('gptPromptMode', id as 'explanation' | 'quiz')}
              />
            </View>

            {/* Select Reel Content Folder Checklist */}
            {showReelContentSelect && (
              <View style={[styles.settingGroup, { marginTop: 18 }]}>
                <Text style={styles.groupLabel}>Select Reel Content</Text>
                <View style={{ backgroundColor: 'rgba(248, 250, 252, 0.8)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.6)', padding: 12, gap: 10 }}>
                  {isGuest ? (
                    <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginVertical: 8 }}>Sign in to filter reels by folder</Text>
                  ) : rootFoldersWithCounts.length === 0 ? (
                    <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginVertical: 8 }}>No folders created yet. Create folders to filter your reels.</Text>
                  ) : (
                    <>
                      {rootFoldersWithCounts.map((folder: any) => {
                        const isChecked = selectedFolderIds.includes(folder._id);
                        return (
                          <TouchableOpacity
                            key={folder._id}
                            onPress={() => handleToggleFolder(folder._id)}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <FolderIcon size={16} color={folder.color || '#7c3aed'} />
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }}>
                                {folder.title} ({folder.cardCount ?? 0})
                              </Text>
                            </View>
                            {isChecked ? (
                              <CheckSquare size={18} color="#8B5CF6" strokeWidth={2.5} />
                            ) : (
                              <Square size={18} color="#94A3B8" strokeWidth={2} />
                            )}
                          </TouchableOpacity>
                        );
                      })}

                      {/* Save Preferences Button */}
                      <TouchableOpacity
                        onPress={handleSavePreferences}
                        disabled={prefSaving}
                        activeOpacity={0.8}
                        style={{
                          backgroundColor: '#8B5CF6',
                          borderRadius: 16,
                          height: 40,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 10,
                          flexDirection: 'row',
                          gap: 8,
                          shadowColor: '#8B5CF6',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.15,
                          shadowRadius: 10,
                          elevation: 2,
                          opacity: prefSaving ? 0.7 : 1,
                        }}
                      >
                        {prefSaving ? (
                          <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff' }}>
                            Save Preferences
                          </Text>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {/* Premium Custom Alert Popup Modal */}
      {customAlert && (
        <Modal transparent visible={!!customAlert} animationType="fade" onRequestClose={() => setCustomAlert(null)}>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)', // Premium dark blur overlay
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}>
            <View style={{
              width: '100%',
              maxWidth: 290,
              backgroundColor: '#ffffff',
              borderRadius: 24,
              padding: 20,
              alignItems: 'center',
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.08,
              shadowRadius: 24,
              elevation: 6,
              borderWidth: 1,
              borderColor: 'rgba(226, 232, 240, 0.8)',
            }}>
              {/* Sleek Alert Title */}
              <Text style={{
                fontSize: 15,
                fontWeight: '800',
                color: '#0F172A',
                textAlign: 'center',
                marginBottom: 8,
                letterSpacing: -0.1,
              }}>
                {customAlert.title}
              </Text>
              
              {/* Message */}
              <Text style={{
                fontSize: 12,
                color: '#64748B',
                textAlign: 'center',
                lineHeight: 17,
                marginBottom: 18,
              }}>
                {customAlert.message}
              </Text>

              {/* Action Button */}
              <TouchableOpacity
                onPress={() => setCustomAlert(null)}
                activeOpacity={0.8}
                style={{
                  width: '100%',
                  height: 38,
                  backgroundColor: '#8B5CF6',
                  borderRadius: 14,
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#8B5CF6',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                  elevation: 1,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '700' }}>
                  Acknowledge
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
});

// Backward compatible default export mapping to ReelsSettingsOverlay as it was the original
export default ReelsSettingsOverlay;

// -------------------------------------------------------------
// STYLING SYSTEM
// -------------------------------------------------------------
const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
  },
  mySpaceSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    overflow: 'hidden',
    paddingBottom: 8,
  },
  reelsSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    width: '100%',
    maxWidth: 340,
    maxHeight: height * 0.75,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  reelsHeaderTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  closeBtn: {
    backgroundColor: 'rgba(226, 232, 240, 0.5)',
    borderRadius: 16,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  settingGroup: {
    marginTop: 14,
    marginBottom: 4,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    paddingLeft: 2,
  },
  authButton: {
    flexDirection: 'row',
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  authButtonSignIn: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  authButtonSignOut: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  authButtonTextSignIn: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  authButtonTextSignOut: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  statsPanel: {
    flexDirection: 'row',
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
    paddingVertical: 12,
    marginVertical: 8,
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(226, 232, 240, 0.8)',
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.1,
  },
});
