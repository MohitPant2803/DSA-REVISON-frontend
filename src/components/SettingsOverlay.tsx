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
  FlatList,
  Share,
  Linking,
  Switch,
} from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, LogOut, LogIn, Moon, Sun, CheckSquare, Square, Folder as FolderIcon, Trash2 } from 'lucide-react-native';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { themePalettes, addAlpha } from '@/theme/themePalettes';
import { useThemePalette } from '@/hooks/useThemePalette';
import { useTrackingStore } from '@/store/useTrackingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useGetFolders } from '@/hooks/useFolders';
import { useSyncEngine } from '@/hooks/useSyncEngine';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';
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
import { SpringPressable } from '@/components/SpringPressable';


const { width, height } = Dimensions.get('window');

const lightHaptic = () => {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = require('expo-haptics');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    if (Platform.OS === 'android') {
      Vibration.vibrate(10);
    } else {
      Vibration.vibrate(6);
    }
  }
};

const getCleanId = (id: any): string => {
  if (!id) return '';
  if (typeof id === 'object') {
    return (id._id || id.id || id).toString();
  }
  return id.toString();
};

const getThreeDaysCycle = (startDay: number): number[] => {
  const day2 = ((startDay - 1 + 3) % 7) + 1;
  const day3 = ((day2 - 1 + 3) % 7) + 1;
  return [startDay, day2, day3].sort((a, b) => a - b);
};

const formatTime = (h: number, m: number) => {
  const period = h >= 12 ? 'PM' : 'AM';
  let displayHour = h % 12;
  if (displayHour === 0) displayHour = 12;
  return `${String(displayHour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

const getRepeatSummary = (freq: string, days: number[]): string => {
  if (freq === 'daily') return 'Repeats every day';
  if (freq === 'three_days') {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeNames = days.map(d => dayNames[d - 1]);
    return `Repeats every 3 days (${activeNames.join(', ')})`;
  }
  
  if (!days || days.length === 0) return 'No repeat days selected';
  if (days.length === 7) return 'Repeats every day';
  
  const weekdays = [2, 3, 4, 5, 6];
  const weekends = [1, 7];
  
  const hasAllWeekdays = weekdays.every(d => days.includes(d)) && weekdays.length === days.filter(d => weekdays.includes(d)).length;
  const hasAllWeekends = weekends.every(d => days.includes(d)) && weekends.length === days.filter(d => weekends.includes(d)).length;
  
  if (hasAllWeekdays && days.length === 5) return 'Repeats on weekdays (Mon - Fri)';
  if (hasAllWeekends && days.length === 2) return 'Repeats on weekends (Sat - Sun)';
  if (hasAllWeekdays && hasAllWeekends) return 'Repeats every day';
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activeNames = days.map(d => dayNames[d - 1]);
  return `Repeats weekly on ${activeNames.join(', ')}`;
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
  const palette = useThemePalette();

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
    <View style={[segmentedStyles.container, { backgroundColor: palette.inputBg, borderColor: palette.border }]}>
      <Animated.View style={[segmentedStyles.pill, animatedStyle, { backgroundColor: palette.surface, shadowColor: palette.shadow }]} />
      {options.map((option) => {
        const isActive = option.id === activeId;
        return (
          <Pressable
            key={option.id}
            onPress={() => {
              lightHaptic();
              onChange(option.id);
            }}
            style={segmentedStyles.segmentButton}
          >
            <Text style={[
              segmentedStyles.segmentText, 
              { color: palette.textSecondary },
              isActive && { color: palette.accent, fontWeight: '800' }
            ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const segmentedStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 3,
    position: 'relative',
    height: 40,
    alignItems: 'center',
    borderWidth: 1,
  },
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 13,
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
    letterSpacing: -0.1,
  },
});

// -------------------------------------------------------------
// PREMIUM VERTICAL DRUM PICKER WHEEL
// -------------------------------------------------------------
interface ScrollDrumProps {
  data: string[];
  selectedValue: string;
  onValueChange: (value: string) => void;
}

export function ScrollDrum({ data, selectedValue, onValueChange }: ScrollDrumProps) {
  const flatListRef = React.useRef<FlatList<string>>(null);
  const itemHeight = 44; // taller items for premium touch targets
  const paddedData = ['', ...data, ''];
  const palette = useThemePalette();

  React.useEffect(() => {
    const index = data.indexOf(selectedValue);
    if (index !== -1 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: index * itemHeight,
          animated: false,
        });
      }, 50);
    }
  }, [selectedValue]);

  const handleScrollEnd = (e: any) => {
    const offset = e.nativeEvent.contentOffset.y;
    const index = Math.round(offset / itemHeight);
    const val = data[index];
    if (val && val !== selectedValue) {
      lightHaptic();
      onValueChange(val);
    }
  };

  return (
    <View style={drumStyles.container}>
      <FlatList<string>
        ref={flatListRef}
        data={paddedData}
        keyExtractor={(_: string, i: number) => i.toString()}
        renderItem={({ item }: { item: string }) => {
          const isSelected = item === selectedValue;
          return (
            <View style={drumStyles.item}>
              <Text 
                style={[
                  drumStyles.itemText, 
                  { color: palette.textMuted },
                  isSelected && [drumStyles.itemTextActive, { color: palette.accent }]
                ]}
              >
                {item}
              </Text>
            </View>
          );
        }}
        getItemLayout={(_: any, index: number) => ({ length: itemHeight, offset: itemHeight * index, index })}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ paddingVertical: 0 }}
      />
    </View>
  );
}

const drumStyles = StyleSheet.create({
  container: {
    height: 132,
    width: 65,
    overflow: 'hidden',
    position: 'relative',
  },
  item: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  itemTextActive: {
    fontSize: 17,
    fontWeight: '800',
  },
});

// -------------------------------------------------------------
// NATIVE DRUM-STYLE TIME PICKER MODAL
// -------------------------------------------------------------
interface TactileTimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialHour: number;
  initialMinute: number;
  onSave: (hour: number, minute: number) => void;
}

export function TactileTimePickerModal({ isOpen, onClose, initialHour, initialMinute, onSave }: TactileTimePickerModalProps) {
  const isPM = initialHour >= 12;
  const initialHour12 = initialHour % 12 || 12;
  const palette = useThemePalette();

  const [selectedHour, setSelectedHour] = useState(String(initialHour12).padStart(2, '0'));
  const [selectedMinute, setSelectedMinute] = useState(String(initialMinute).padStart(2, '0'));
  const [selectedPeriod, setSelectedPeriod] = useState(isPM ? 'PM' : 'AM');

  const hoursData = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutesData = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const periodsData = ['AM', 'PM'];

  const handleConfirm = () => {
    lightHaptic();
    let hour = parseInt(selectedHour, 10);
    const minute = parseInt(selectedMinute, 10);
    
    if (selectedPeriod === 'PM' && hour !== 12) hour += 12;
    if (selectedPeriod === 'AM' && hour === 12) hour = 0;

    onSave(hour, minute);
    onClose();
  };

  const buttonTextColor = palette.isDark ? palette.textPrimary : palette.surface;

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[pickerModalStyles.fullscreen, { backgroundColor: palette.overlayBg }]}>
        <View style={pickerModalStyles.backdrop} onTouchStart={onClose} />
        <View 
          style={[
            pickerModalStyles.card,
            {
              backgroundColor: palette.dialogBg,
              borderColor: palette.border,
              shadowColor: palette.shadow,
              shadowOpacity: palette.isDark ? 0.20 : 0.1,
              shadowRadius: palette.isDark ? 30 : 28,
            }
          ]}
        >
          <Text style={[pickerModalStyles.title, { color: palette.textPrimary }]}>Set Reminder Time</Text>
          
          <View style={[pickerModalStyles.drumContainer, { backgroundColor: palette.inputBg, borderColor: palette.border }]}>
            {/* Highlights selected row in middle */}
            <View 
              style={[
                pickerModalStyles.highlightOverlay,
                {
                  backgroundColor: addAlpha(palette.accent, 0.06),
                  borderColor: addAlpha(palette.accent, 0.12)
                }
              ]} 
            />
            
            <ScrollDrum 
              data={hoursData} 
              selectedValue={selectedHour} 
              onValueChange={setSelectedHour} 
            />
            <Text style={[pickerModalStyles.colon, { color: palette.accent }]}>:</Text>
            <ScrollDrum 
              data={minutesData} 
              selectedValue={selectedMinute} 
              onValueChange={setSelectedMinute} 
            />
            <View style={{ width: 15 }} />
            <ScrollDrum 
              data={periodsData} 
              selectedValue={selectedPeriod} 
              onValueChange={setSelectedPeriod} 
            />
          </View>

          <View style={pickerModalStyles.actions}>
            <TouchableOpacity 
              onPress={onClose} 
              activeOpacity={0.8}
              style={[pickerModalStyles.btn, pickerModalStyles.btnCancel, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <Text style={[pickerModalStyles.btnTextCancel, { color: palette.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={handleConfirm} 
              activeOpacity={0.8}
              style={[pickerModalStyles.btn, pickerModalStyles.btnSave, { backgroundColor: palette.accent, shadowColor: palette.accentGlow }]}
            >
              <Text style={[pickerModalStyles.btnTextSave, { color: buttonTextColor }]}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pickerModalStyles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  card: {
    width: '100%',
    maxWidth: 290,
    borderRadius: 28,
    padding: 20,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
    borderWidth: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 16,
    letterSpacing: -0.2,
  },
  drumContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 132,
    position: 'relative',
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  highlightOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  colon: {
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 4,
    paddingBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  btn: {
    flex: 1,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    borderWidth: 1,
  },
  btnSave: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  btnTextCancel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  btnTextSave: {
    fontSize: 12.5,
    fontWeight: '700',
  },
});


// -------------------------------------------------------------
// PREMIUM DYNAMIC THEME SELECTOR GRID
// -------------------------------------------------------------
interface ThemeSelectorProps {
  activeThemeId: string;
  onChange: (id: any) => void;
}

export function ThemeSelector({ activeThemeId, onChange }: ThemeSelectorProps) {
  const themesList = Object.values(themePalettes);
  const palette = useThemePalette();
  
  // Clean names to fit nicely in horizontal pills
  const getShortName = (name: string) => {
    switch (name) {
      case 'Japanese Zen Garden': return 'Zen';
      case 'Rainy Window': return 'Rainy';
      case 'Sunny Mountain ⛰️': return 'Sunny';
      case 'Matcha Calm': return 'Matcha';
      case 'Crimson Sunset': return 'Sunset';
      case 'Midnight Focus': return 'Midnight';
      default: return name;
    }
  };

  return (
    <View style={{ 
      flexDirection: 'row', 
      flexWrap: 'wrap', 
      gap: 6, 
      justifyContent: 'space-between', 
      marginVertical: 6,
      paddingHorizontal: 2 
    }}>
      {themesList.map((item) => {
        const isActive = item.id === activeThemeId;
        
        return (
          <SpringPressable
            key={item.id}
            activeScale={0.95}
            onPress={() => {
              lightHaptic();
              onChange(item.id);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: isActive ? item.accent : item.border,
              backgroundColor: isActive ? item.accentBg : item.background,
              width: '31.5%', // exactly 3 items fit in one row
              height: 38,
              justifyContent: 'center',
              marginBottom: 6,
              shadowColor: isActive ? item.accent : palette.shadow,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isActive ? 0.06 : 0,
              shadowRadius: 3,
              elevation: isActive ? 1 : 0,
            }}
          >
            <Text 
              numberOfLines={1} 
              ellipsizeMode="tail"
              style={{
                fontSize: 9.5,
                fontWeight: '800',
                color: isActive ? item.accent : item.textPrimary,
                textAlign: 'center',
                letterSpacing: -0.15,
              }}
            >
              {getShortName(item.name)}
            </Text>
          </SpringPressable>
        );
      })}
    </View>
  );
}

// -------------------------------------------------------------
// MY SPACE SETTINGS OVERLAY (Appearance & Auth Only)
// -------------------------------------------------------------
interface MySpaceSettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MySpaceSettingsOverlay = React.memo(({ isOpen, onClose }: MySpaceSettingsOverlayProps) => {
  const { preferences, updatePreference } = useUserPreferencesStore();
  const palette = useThemePalette();
  const { user, login, logout } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { triggerBackgroundSync } = useSyncEngine();
  const { 
    latestVersion, 
    updateUrl, 
    shareMessage, 
    notificationsEnabled, 
    updateNotificationPreferences,
    notificationHour,
    notificationMinute,
    notificationFrequency,
    notificationCustomDays
  } = usePlaylistStateStore();
  const { step: walkthroughStep, setStep: setWalkthroughStep } = useWalkthroughStore();
  const isWalkthroughActive = walkthroughStep === 'myspace-settings-open';

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
    if (isWalkthroughActive) {
      setWalkthroughStep('myspace-hard-focus');
    }
  };

  const handleUpdateApp = async () => {
    lightHaptic();
    try {
      const supportUrl = 'https://ree-wise-download-website.vercel.app/support';
      const canOpen = await Linking.canOpenURL(supportUrl);
      if (canOpen) {
        await Linking.openURL(supportUrl);
      } else {
        Alert.alert("Error", "Unable to open support link.");
      }
    } catch (err: any) {
      console.error('[SettingsOverlay] Support linking error:', err.message);
      Alert.alert("Error", "Failed to open support link.");
    }
  };

  const handleDeleteAccount = async () => {
    lightHaptic();
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account? This will erase all your progress, custom playlists, folders, streaks, and account details. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setIsAuthenticating(true);
              const { deleteAccount: apiDeleteAccount } = require('@/services/authService');
              await apiDeleteAccount();
              onClose();
              await logout();
              Toast.show({
                type: 'success',
                text1: 'Account Deleted',
                text2: 'Your account has been successfully removed.',
              });
            } catch (err: any) {
              console.error('[SettingsOverlay] Delete account error:', err.message);
              Alert.alert("Error", "Failed to delete account. Please try again later.");
            } finally {
              setIsAuthenticating(false);
            }
          }
        }
      ]
    );
  };

  const handleShareApp = async () => {
    lightHaptic();
    try {
      await Clipboard.setStringAsync(updateUrl);
      Toast.show({
        type: 'success',
        text1: 'Link copied',
        text2: 'Share URL copied to clipboard!',
      });
    } catch (e: any) {
      console.warn('[SettingsOverlay] Failed to copy share URL to clipboard:', e.message);
    }
    const formattedShareMessage = `Here's the link of the cool app you were asking about 😉 \n\n${updateUrl}`;
    try {
      await Share.share({
        message: formattedShareMessage,
      });
    } catch (err: any) {
      console.error('[SettingsOverlay] Share failed:', err.message);
    }
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
        <Animated.View style={[styles.backdrop, { backgroundColor: palette.overlayBg }, animatedBackdropStyle]} onTouchStart={handleClose} />
        
        <Animated.View style={[
          styles.mySpaceSheet, 
          animatedSheetStyle,
          {
            backgroundColor: palette.dialogBg,
            borderColor: palette.border,
            shadowColor: palette.shadow,
          }
        ]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.textPrimary }]}>Settings</Text>
            <Pressable 
              onPress={handleClose} 
              style={({ pressed }) => [
                styles.closeBtn, 
                { backgroundColor: palette.inputBg },
                pressed && { opacity: 0.7 }
              ]}
            >
              <X color={palette.textSecondary} size={18} strokeWidth={2.5} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            {...({ delaysContentTouches: false } as any)}
          >
            {/* Appearance Section */}
            <View style={styles.settingGroup}>
              <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>Themes</Text>
              <ThemeSelector
                activeThemeId={preferences.theme || 'zen'}
                onChange={(id) => {
                  updatePreference('theme', id);
                  if (isWalkthroughActive) {
                    lightHaptic();
                    onClose();
                    setWalkthroughStep('myspace-hard-focus');
                  }
                }}
              />
            </View>


            {/* App Actions Section */}
            <View style={styles.settingGroup} pointerEvents={isWalkthroughActive ? "none" : "auto"}>
              <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>App Actions</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={handleUpdateApp}
                  activeOpacity={0.8}
                  style={[
                    styles.authButton,
                    {
                      backgroundColor: palette.inputBg,
                      borderColor: palette.border,
                      flex: 1,
                    }
                  ]}
                >
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: palette.textSecondary }}>
                    Support & Help
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleShareApp}
                  activeOpacity={0.8}
                  style={[
                    styles.authButton,
                    { 
                      flex: 1,
                      backgroundColor: palette.accent,
                      borderColor: palette.accent,
                    }
                  ]}
                >
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: palette.isDark ? palette.textPrimary : palette.surface }}>
                    Share App
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Streak Reminder Section */}
            <View style={styles.settingGroup} pointerEvents={isWalkthroughActive ? "none" : "auto"}>
              <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>Notifications</Text>
              <View 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 20,
                  backgroundColor: palette.inputBg,
                  borderColor: palette.border,
                  borderWidth: 1,
                  marginTop: 4,
                }}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: palette.textPrimary }}>
                    Streak Reminder
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: palette.textSecondary, marginTop: 2 }}>
                    Get alerted daily when your streak is at risk.
                  </Text>
                </View>
                <Switch 
                  value={notificationsEnabled}
                  onValueChange={async (value) => {
                    lightHaptic();
                    await updateNotificationPreferences(
                      value,
                      notificationHour,
                      notificationMinute,
                      notificationFrequency,
                      notificationCustomDays
                    );
                  }}
                  trackColor={{ false: palette.border, true: palette.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Authentication Section - placed at bottom */}
            <View style={styles.settingGroup} pointerEvents={isWalkthroughActive ? "none" : "auto"}>
              <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>Account</Text>
              
              {isGuest ? (
                <TouchableOpacity
                  onPress={handleAuthAction}
                  activeOpacity={0.8}
                  disabled={isAuthenticating}
                  style={[
                    styles.authButton,
                    { backgroundColor: palette.accent, borderColor: palette.accent }
                  ]}
                >
                  {isAuthenticating ? (
                    <ActivityIndicator color={palette.isDark ? palette.textPrimary : palette.surface} />
                  ) : (
                    <>
                      <LogIn color={palette.isDark ? palette.textPrimary : palette.surface} size={16} strokeWidth={2.2} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: palette.isDark ? palette.textPrimary : palette.surface }}>Sign In</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  {/* Delete Account on the Left */}
                  <TouchableOpacity
                    onPress={handleDeleteAccount}
                    activeOpacity={0.8}
                    disabled={isAuthenticating}
                    style={[
                      styles.authButton,
                      {
                        flex: 1,
                        backgroundColor: addAlpha(palette.error, palette.isDark ? 0.08 : 0.05),
                        borderColor: addAlpha(palette.error, palette.isDark ? 0.20 : 0.15),
                        borderWidth: 1,
                      }
                    ]}
                  >
                    <Trash2 color={palette.error} size={16} strokeWidth={2.2} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: palette.error }}>Delete Account</Text>
                  </TouchableOpacity>

                  {/* Sign Out on the Right */}
                  <TouchableOpacity
                    onPress={handleAuthAction}
                    activeOpacity={0.8}
                    disabled={isAuthenticating}
                    style={[
                      styles.authButton,
                      {
                        flex: 1,
                        backgroundColor: addAlpha(palette.error, palette.isDark ? 0.08 : 0.05),
                        borderColor: addAlpha(palette.error, palette.isDark ? 0.20 : 0.15),
                        borderWidth: 1,
                      }
                    ]}
                  >
                    {isAuthenticating ? (
                      <ActivityIndicator color={palette.error} />
                    ) : (
                      <>
                        <LogOut color={palette.error} size={16} strokeWidth={2.2} style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: palette.error }}>Sign Out</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
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
  const palette = useThemePalette();
  const { currentMode, setMode, totalSwipes, totalScrolls } = useTrackingStore();
  const { user } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  const queryClient = useQueryClient();
  const { triggerBackgroundSync } = useSyncEngine();


  const { data: foldersData } = useGetFolders({ limit: 100 });
  const rootFolders = React.useMemo(() => {
    return foldersData?.results?.filter((f: any) => f && (f.parentFolderId === null || !f.parentFolderId)) || [];
  }, [foldersData]);

  const cardsById = usePlaylistStateStore((s) => s.cardsById);
  const foldersById = usePlaylistStateStore((s) => s.foldersById);

  const rootFoldersWithCounts = React.useMemo(() => {
    const directCardCounts = new Map<string, number>();
    Object.values(cardsById || {}).forEach((card: any) => {
      if (card) {
        const folderId = card.folderId ? getCleanId(card.folderId) : null;
        if (folderId) {
          directCardCounts.set(folderId, (directCardCounts.get(folderId) || 0) + 1);
        }
      }
    });

    const childrenMap = new Map<string, string[]>();
    Object.values(foldersById || {}).forEach((f: any) => {
      if (f && f.parentFolderId && f._id) {
        const pId = getCleanId(f.parentFolderId);
        const childId = getCleanId(f._id);
        if (pId && childId) {
          const existing = childrenMap.get(pId) || [];
          existing.push(childId);
          childrenMap.set(pId, existing);
        }
      }
    });

    const getDescendantFolderIds = (folderId: string): string[] => {
      const ids: string[] = [folderId];
      const queue: string[] = [folderId];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const children = childrenMap.get(curr) || [];
        children.forEach((child) => {
          if (child && !ids.includes(child)) {
            ids.push(child);
            queue.push(child);
          }
        });
      }
      return ids;
    };

    return rootFolders.map((rootFolder: any) => {
      if (!rootFolder || !rootFolder._id) return { ...rootFolder, cardCount: 0 };
      const rootId = getCleanId(rootFolder._id);
      const descendants = getDescendantFolderIds(rootId);
      
      let totalCards = 0;
      descendants.forEach((dId) => {
        if (dId) {
          totalCards += directCardCounts.get(dId) || 0;
        }
      });

      return {
        ...rootFolder,
        cardCount: totalCards,
      };
    });
  }, [cardsById, foldersById, rootFolders]);

  const selectedRootFolderIds = usePlaylistStateStore((s) => s.selectedRootFolderIds) || [];

  const { data: prefsData } = useQuery({
    queryKey: ['reelPreferences', user?.id],
    queryFn: reelsFeedService.getReelPreferences,
    enabled: !isGuest && !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(() => {
    const safeSelectedRootFolderIds = selectedRootFolderIds || [];
    if (safeSelectedRootFolderIds.length > 0) {
      return safeSelectedRootFolderIds.map(id => getCleanId(id));
    }
    if (prefsData?.selectedRootFolderIds && prefsData.selectedRootFolderIds.length > 0) {
      return prefsData.selectedRootFolderIds.map((id: any) => getCleanId(id));
    }
    return rootFolders.filter((f: any) => f && f._id).map((f: any) => getCleanId(f._id));
  });


  // Keep local Zustand & SQLite in sync when server preferences are fetched successfully
  useEffect(() => {
    if (prefsData?.selectedRootFolderIds && Array.isArray(prefsData.selectedRootFolderIds) && !isGuest && user?.id) {
      const serverIds = prefsData.selectedRootFolderIds.map((id: any) => getCleanId(id));
      const safeSelectedRootFolderIds = (selectedRootFolderIds || []).map(id => getCleanId(id));
      const isSame = safeSelectedRootFolderIds.length === serverIds.length &&
        safeSelectedRootFolderIds.every((val, index) => val === serverIds[index]);
      
      if (!isSame) {
        usePlaylistStateStore.getState().setSelectedRootFolderIdsInStore(serverIds);
      }
    }
  }, [prefsData, isGuest, user?.id]);

  useEffect(() => {
    if (isOpen) {
      const safeSelectedRootFolderIds = selectedRootFolderIds || [];
      if (safeSelectedRootFolderIds.length > 0) {
        setSelectedFolderIds(safeSelectedRootFolderIds.map(id => getCleanId(id)));
      } else if (prefsData?.selectedRootFolderIds && prefsData.selectedRootFolderIds.length > 0) {
        setSelectedFolderIds(prefsData.selectedRootFolderIds.map((id: any) => getCleanId(id)));
      } else if (rootFolders && rootFolders.length > 0) {
        setSelectedFolderIds(rootFolders.filter((f: any) => f && f._id).map((f: any) => getCleanId(f._id)));
      }
    }
  }, [isOpen, selectedRootFolderIds, prefsData?.selectedRootFolderIds, rootFolders.length]);

  const [prefSaving, setPrefSaving] = useState(false);
  const [customAlert, setCustomAlert] = useState<{ title: string; message: string } | null>(null);
  const saveButtonScale = useSharedValue(1);

  const animatedSaveButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveButtonScale.value }],
  }));

  const handleToggleFolder = (folderId: string) => {
    if (isGuest) return;
    lightHaptic(); // Trigger haptic tick instantly on toggle!
    const cleanFolderId = getCleanId(folderId);
    const isAlreadySelected = selectedFolderIds.includes(cleanFolderId);
    let nextSelected: string[];
    
    if (isAlreadySelected) {
      nextSelected = selectedFolderIds.filter(id => id !== cleanFolderId);
      if (nextSelected.length === 0) {
        setCustomAlert({
          title: 'Selection Locked',
          message: 'You must select at least one folder for study content.'
        });
        return;
      }
    } else {
      nextSelected = [...selectedFolderIds, cleanFolderId];
    }

    // Calculate total cards in the next selection
    const totalCardsInNextSelection = rootFoldersWithCounts
      .filter((f: any) => f && f._id && nextSelected.includes(getCleanId(f._id)))
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

  const handleSavePreferences = () => {
    if (isGuest) {
      onClose();
      return;
    }
    
    // Trigger press animation immediately
    saveButtonScale.value = withSpring(0.92, { damping: 10, mass: 1, overshootClamping: true });
    setTimeout(() => {
      saveButtonScale.value = withSpring(1, { damping: 10, mass: 1 });
    }, 100);
    
    setPrefSaving(true);
    lightHaptic();
    
    setTimeout(() => {
      // Clear the saved Reels session in Zustand to force a fresh study session with the new folders!
      useTrackingStore.getState().setReelsSession({
        sessionId: null,
        sessionCards: [],
        activeIndex: 0,
        sourceType: null,
        sourceId: null,
      });
      
      // 1. Save folder content preferences purely in Zustand memory (offline-queued)
      usePlaylistStateStore.getState().updateReelPreferencesInStore(selectedFolderIds);
      
      // 2. Synchronously update query data cache to prevent closing state reverts
      queryClient.setQueryData(['reelPreferences', user?.id], { selectedRootFolderIds: selectedFolderIds });
      
      setPrefSaving(false);
      onClose();
    }, 250);
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

  const isCodeMode = preferences?.explanationFlowOrder?.[1] === 'code';

  return (
    <Modal visible={shouldRender} animationType="none" transparent onRequestClose={handleClose}>
      <View style={styles.fullscreen}>
        <Animated.View style={[styles.backdrop, { backgroundColor: palette.overlayBg }, animatedBackdropStyle]} onTouchStart={handleClose} />

        <Animated.View style={[
          styles.reelsSheet, 
          animatedSheetStyle,
          {
            backgroundColor: palette.dialogBg,
            borderColor: palette.border,
            shadowColor: palette.shadow,
          }
        ]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.reelsHeaderTitle, { color: palette.textPrimary }]} numberOfLines={1}>
                {playlistName}
              </Text>
            </View>
            <Pressable 
              onPress={handleClose} 
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: palette.inputBg },
                pressed && { opacity: 0.7 }
              ]}
            >
              <X color={palette.textSecondary} size={18} strokeWidth={2.5} />
            </Pressable>
          </View>

          <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={styles.scrollContent}
            {...({ delaysContentTouches: false } as any)}
          >
            {/* Session Stats Section */}
            <View style={[styles.statsPanel, { backgroundColor: palette.inputBg, borderColor: palette.border }]}>
              <View style={styles.statBox}>
                <Text style={[styles.statLabel, { color: palette.textMuted }]}>This Session</Text>
                <Text style={[styles.statValue, { color: palette.textPrimary }]}>{questionsRevised}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
              <View style={styles.statBox}>
                <Text style={[styles.statLabel, { color: palette.textMuted }]}>Total Revised</Text>
                <Text style={[styles.statValue, { color: palette.textPrimary }]}>{totalSwipes + totalScrolls}</Text>
              </View>
            </View>



            {/* Content Mode */}
            <View style={styles.settingGroup}>
              <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>Content Focus</Text>
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

            {/* GPT Prompt Mode */}
            <View style={styles.settingGroup}>
              <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>GPT Prompt Mode</Text>
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
                <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>Select Reel Content</Text>
                <View style={{ backgroundColor: palette.inputBg, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 12, gap: 10 }}>
                  {isGuest ? (
                    <Text style={{ fontSize: 13, color: palette.textSecondary, textAlign: 'center', marginVertical: 8 }}>Sign in to filter reels by folder</Text>
                  ) : rootFoldersWithCounts.length === 0 ? (
                    <Text style={{ fontSize: 13, color: palette.textSecondary, textAlign: 'center', marginVertical: 8 }}>No folders created yet. Create folders to filter your reels.</Text>
                  ) : (
                    <>
                      {rootFoldersWithCounts.map((folder: any) => {
                        if (!folder || !folder._id) return null;
                        const isChecked = selectedFolderIds.includes(folder._id);
                        return (
                          <Pressable
                            key={folder._id}
                            onPress={() => handleToggleFolder(folder._id)}
                            style={({ pressed }) => [
                              { width: '100%' },
                              pressed && { opacity: 0.7 }
                            ]}
                          >
                            <View style={styles.folderRow}>
                              <FolderIcon size={16} color={folder.color || palette.accent} style={{ marginRight: 8 }} />
                              <Text 
                                style={{ fontSize: 13, fontWeight: '600', color: palette.textPrimary, flex: 1, marginRight: 16 }}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {folder.title} ({folder.cardCount ?? 0})
                              </Text>
                              {isChecked ? (
                                <CheckSquare size={18} color={palette.accent} strokeWidth={2.5} />
                              ) : (
                                <Square size={18} color={palette.textMuted} strokeWidth={2} />
                              )}
                            </View>
                          </Pressable>
                        );
                      })}

                      {/* Save Preferences Button */}
                      <Animated.View style={animatedSaveButtonStyle}>
                        <TouchableOpacity
                          onPress={handleSavePreferences}
                          disabled={prefSaving}
                          activeOpacity={0.8}
                          style={{
                            backgroundColor: palette.accent,
                            borderRadius: 16,
                            height: 40,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 10,
                            flexDirection: 'row',
                            gap: 8,
                            shadowColor: palette.accentGlow,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.15,
                            shadowRadius: 10,
                            elevation: 2,
                            opacity: prefSaving ? 0.7 : 1,
                          }}
                        >
                          {prefSaving ? (
                            <>
                              <ActivityIndicator color={palette.isDark ? palette.textPrimary : palette.surface} size="small" />
                              <Text style={{ fontSize: 13, fontWeight: '700', color: palette.isDark ? palette.textPrimary : palette.surface }}>
                                Saving...
                              </Text>
                            </>
                          ) : (
                            <Text style={{ fontSize: 13, fontWeight: '700', color: palette.isDark ? palette.textPrimary : palette.surface }}>
                              Save Preferences
                            </Text>
                          )}
                        </TouchableOpacity>
                      </Animated.View>
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
            backgroundColor: palette.overlayBg,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}>
            <View style={{
              width: '100%',
              maxWidth: 290,
              backgroundColor: palette.dialogBg,
              borderRadius: 24,
              padding: 20,
              alignItems: 'center',
              shadowColor: palette.shadow,
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: palette.isDark ? 0.20 : 0.1,
              shadowRadius: 24,
              elevation: 6,
              borderWidth: 1,
              borderColor: palette.border,
            }}>
              {/* Sleek Alert Title */}
              <Text style={{
                fontSize: 15,
                fontWeight: '800',
                color: palette.textPrimary,
                textAlign: 'center',
                marginBottom: 8,
                letterSpacing: -0.1,
              }}>
                {customAlert.title}
              </Text>
              
              {/* Message */}
              <Text style={{
                fontSize: 12,
                color: palette.textSecondary,
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
                  backgroundColor: palette.accent,
                  borderRadius: 14,
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: palette.accentGlow,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 1,
                }}
              >
                <Text style={{ color: palette.isDark ? palette.textPrimary : palette.surface, fontSize: 12.5, fontWeight: '700' }}>
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
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    width: '100%',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  mySpaceSheet: {
    borderRadius: 28,
    width: '100%',
    maxWidth: 320,
    maxHeight: height * 0.8,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  reelsSheet: {
    borderRadius: 32,
    width: '100%',
    maxWidth: 340,
    maxHeight: height * 0.75,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 8,
    borderWidth: 1,
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
    letterSpacing: -0.2,
  },
  reelsHeaderTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  closeBtn: {
    borderRadius: 20,
    width: 36,
    height: 36,
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
  statsPanel: {
    flexDirection: 'row',
    borderRadius: 20,
    borderWidth: 1,
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
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reminderToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  notificationStatusSubtext: {
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
    paddingLeft: 2,
    paddingRight: 8,
    marginTop: 2,
  },
  timeControlsContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    marginTop: 2,
  },
  frequencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    paddingBottom: 10,
  },
  customDaysContainer: {
    marginBottom: 12,
    borderBottomWidth: 1,
    paddingBottom: 10,
  },
  customDaysTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    paddingLeft: 2,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dayBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  timeControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeControlLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 2,
  },
  pickerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerValText: {
    fontSize: 13,
    fontWeight: '700',
    width: 36,
    textAlign: 'center',
  },
  scrollSelectorGroup: {
    marginVertical: 8,
  },
  scrollSelectorLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingLeft: 2,
  },
  horizontalScrollContent: {
    paddingRight: 16,
    gap: 8,
    paddingVertical: 4,
  },
  hourScrollBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  hourScrollText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  minuteScrollBadge: {
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  minuteScrollText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  customDaysSummary: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    paddingLeft: 2,
    fontStyle: 'italic',
  },
  digitalClockContainer: {
    marginVertical: 12,
    alignItems: 'center',
  },
  digitalClockLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  digitalClockCapsule: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  digitalClockText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  digitalClockSubtext: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
});

