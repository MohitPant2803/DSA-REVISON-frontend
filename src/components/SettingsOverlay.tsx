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
import * as reelsFeedService from '@/services/reelsFeedService';
import { useQueryClient } from '@tanstack/react-query';
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

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  offlineAccess: true,
});


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
      slideValue.value = withSpring(activeIndex, { damping: 20, stiffness: 220 });
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

  const [shouldRender, setShouldRender] = useState(isOpen);
  const backdropOpacity = useSharedValue(0);
  const sheetScale = useSharedValue(0.96);
  const sheetOpacity = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => {
        backdropOpacity.value = withTiming(0.3, { duration: 200 });
        sheetScale.value = withSpring(1, { damping: 20, stiffness: 220 });
        sheetOpacity.value = withTiming(1, { duration: 180 });
      }, 15);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 160 });
      sheetScale.value = withTiming(0.96, { duration: 150 });
      sheetOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
        if (finished) {
          runOnJS(setShouldRender)(false);
        }
      });
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
  const { currentMode, setMode } = useTrackingStore();
  const { user } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  const queryClient = useQueryClient();

  const { data: foldersData } = useGetFolders({ limit: 100 });
  const rootFolders = React.useMemo(() => {
    return foldersData?.results?.filter((f: any) => f.parentFolderId === null || !f.parentFolderId) || [];
  }, [foldersData]);

  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [prefLoading, setPrefLoading] = useState(false);

  useEffect(() => {
    if (isOpen && !isGuest) {
      const fetchPrefs = async () => {
        try {
          setPrefLoading(true);
          const prefs = await reelsFeedService.getReelPreferences();
          setSelectedFolderIds(prefs.selectedRootFolderIds);
        } catch (err) {
          console.error('[Prefs Fetch Error]', err);
        } finally {
          setPrefLoading(false);
        }
      };
      fetchPrefs();
    }
  }, [isOpen, isGuest]);

  const handleToggleFolder = async (folderId: string) => {
    if (isGuest) return;
    const isAlreadySelected = selectedFolderIds.includes(folderId);
    let nextSelected: string[];
    
    if (isAlreadySelected) {
      nextSelected = selectedFolderIds.filter(id => id !== folderId);
      if (nextSelected.length === 0) {
        if (Platform.OS === 'web') {
          alert('You must select at least one folder for study content.');
        } else {
          Alert.alert('Selection Locked', 'You must select at least one folder for study content.');
        }
        return;
      }
    } else {
      nextSelected = [...selectedFolderIds, folderId];
    }

    // Calculate total cards in the next selection
    const totalCardsInNextSelection = rootFolders
      .filter((f: any) => nextSelected.includes(f._id))
      .reduce((sum: number, f: any) => sum + (f.cardCount || 0), 0);

    if (totalCardsInNextSelection === 0) {
      if (Platform.OS === 'web') {
        alert('Warning: No cards will be available to preview in the selected folder(s).');
      } else {
        Alert.alert(
          'Empty Selection Warning', 
          'Warning: The selected folder(s) contain 0 cards. Please select at least one folder with cards to study.'
        );
      }
      return;
    }

    setSelectedFolderIds(nextSelected);

    try {
      await reelsFeedService.updateReelPreferences(nextSelected);
      queryClient.invalidateQueries({ queryKey: ['reelFeed'] });
      Toast.show({
        type: 'info',
        text1: 'Preferences Updated',
        text2: 'This reels content preference will be applied after 5-10 reels',
        position: 'top',
        visibilityTime: 4000,
      });
    } catch (err) {
      console.error('[Prefs Save Error]', err);
      // Rollback
      setSelectedFolderIds(selectedFolderIds);
    }
  };

  const [shouldRender, setShouldRender] = useState(isOpen);
  const backdropOpacity = useSharedValue(0);
  const sheetScale = useSharedValue(0.96);
  const sheetOpacity = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => {
        backdropOpacity.value = withTiming(0.3, { duration: 200 });
        sheetScale.value = withSpring(1, { damping: 20, stiffness: 220 });
        sheetOpacity.value = withTiming(1, { duration: 180 });
      }, 15);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 160 });
      sheetScale.value = withTiming(0.96, { duration: 150 });
      sheetOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
        if (finished) {
          runOnJS(setShouldRender)(false);
        }
      });
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
                <Text style={styles.statLabel}>Session Timer</Text>
                <Text style={styles.statValue}>{sessionTimer}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Revised Cards</Text>
                <Text style={styles.statValue}>{questionsRevised}</Text>
              </View>
            </View>

            {/* Playback Mode */}
            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Playback Mode</Text>
              <SegmentedControl
                options={[
                  { id: 'sequential', label: 'Order' },
                  { id: 'shuffle', label: 'Shuffle' },
                ]}
                activeId={currentMode === 'shuffle' ? 'shuffle' : 'sequential'}
                onChange={(id) => setMode(id as 'sequential' | 'shuffle')}
              />
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
            {showReelContentSelect && !isGuest && rootFolders.length > 0 && (
              <View style={[styles.settingGroup, { marginTop: 18 }]}>
                <Text style={styles.groupLabel}>Select Reel Content</Text>
                <View style={{ backgroundColor: 'rgba(248, 250, 252, 0.8)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.6)', padding: 12, gap: 10 }}>
                  {rootFolders.map((folder: any) => {
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
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
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
