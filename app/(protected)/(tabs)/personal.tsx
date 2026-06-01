import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Vibration,
  Modal,
  Pressable,
  TouchableOpacity,
  InteractionManager,
} from 'react-native';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { interactionScheduler } from '@/utils/interactionScheduler';
import {
  Plus,
  ListMusic,
  BookOpen,
  Check,
  Zap,
  SkipForward,
  Brain,
  Folder,
  Smile,
  Play,
  ChevronRight,
  MoreHorizontal,
  Settings2,
  Lock,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylists, useCreatePlaylist, useDeletePlaylist, useUpdatePlaylist } from '@/hooks/usePlaylists';
import { useDashboard } from '@/hooks/useDashboard';
import { MySpaceSettingsOverlay } from '@/components/SettingsOverlay';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import api from '@/services/api';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { SyncPauseGate } from '@/components/SyncPauseGate';
import { usePlaylistCount } from '@/hooks/usePlaylistStoreSelectors';
import { useBiometricReauth } from '@/hooks/useBiometricReauth';
import { theme } from '@/theme';
import { ReeWCharacter } from '@/components/ReeWCharacter';

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(6);
  }
};

// -------------------------------------------------------------
// PINNED SMART PLAYLIST CARD
// -------------------------------------------------------------
interface SmartPlaylistCardProps {
  playlist: any;
  onPress: () => void;
}

const SmartPlaylistCard = React.memo(({ playlist, onPress }: SmartPlaylistCardProps) => {
  const getCardTheme = () => {
    switch (playlist.id) {
      case 'easy':
        return {
          bg: '#FFFFFF',
          border: 'rgba(16, 185, 129, 0.15)',
          text: '#10B981',
          iconBg: 'rgba(16, 185, 129, 0.08)',
          blobColor: 'rgba(16, 185, 129, 0.02)',
          displayName: 'Easy progress',
          statusText: 'Keep it going',
          statusColor: '#10B981',
          icon: Check,
        };
      case 'medium':
        return {
          bg: '#FFFFFF',
          border: 'rgba(245, 158, 11, 0.15)',
          text: '#D97706',
          iconBg: 'rgba(245, 158, 11, 0.08)',
          blobColor: 'rgba(245, 158, 11, 0.02)',
          displayName: 'Medium practice',
          statusText: 'Good to review',
          statusColor: '#D97706',
          icon: Zap,
        };
      case 'hard':
        return {
          bg: '#FFFFFF',
          border: 'rgba(239, 68, 68, 0.15)',
          text: '#DC2626',
          iconBg: 'rgba(239, 68, 68, 0.08)',
          blobColor: 'rgba(239, 68, 68, 0.02)',
          displayName: 'Hard focus',
          statusText: 'Cards need attention',
          statusColor: '#DC2626',
          icon: Brain,
        };
      case 'skipped':
      default:
        return {
          bg: '#FFFFFF',
          border: 'rgba(59, 130, 246, 0.15)',
          text: '#2563EB',
          iconBg: 'rgba(59, 130, 246, 0.08)',
          blobColor: 'rgba(59, 130, 246, 0.02)',
          displayName: 'Skipped for now',
          statusText: 'Come back later',
          statusColor: '#2563EB',
          icon: SkipForward,
        };
    }
  };

  const theme = getCardTheme();
  const IconComponent = theme.icon;

  return (
    <View style={{ width: '48%', marginBottom: 12 }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        className="w-full p-5 rounded-[26px] border relative overflow-hidden"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.03,
          shadowRadius: 14,
          elevation: 2,
        }}
      >
        {/* Soft corner blob decoration */}
        <View
          style={{
            position: 'absolute',
            top: -24,
            right: -24,
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: theme.blobColor,
          }}
        />

        {/* Header containing icon */}
        <View className="flex-row items-center justify-between">
          <View
            className="w-9 h-9 rounded-full items-center justify-center border"
            style={{ backgroundColor: theme.iconBg, borderColor: 'rgba(15,23,42,0.04)' }}
          >
            <IconComponent color={theme.text} size={15} strokeWidth={2.0} />
          </View>
        </View>

        {/* Label */}
        <Text className="font-bold text-[13px] text-[#0F172A] mt-4 tracking-tight">
          {theme.displayName}
        </Text>

        {/* Status subtext */}
        <Text 
          className="text-[10px] font-semibold mt-1 tracking-tight"
          style={{ color: theme.statusColor }}
        >
          {theme.statusText}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

// -------------------------------------------------------------
// CUSTOM COLLECTION GRID CARD WITH LONG-PRESS
// -------------------------------------------------------------
interface CustomPlaylistCardProps {
  playlist: any;
  onPress: () => void;
  onLongPress: () => void;
}

const CustomPlaylistCard = React.memo(({ playlist, onPress, onLongPress }: CustomPlaylistCardProps) => {
  const count = usePlaylistCount(playlist.id);
  const displayCount = count !== undefined ? count : (playlist.itemCount ?? 0);

  return (
    <View style={{ width: '48%', marginBottom: 12 }}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.85}
        className="w-full flex-row items-center p-4 rounded-[22px] border bg-white justify-between"
        style={{
          borderColor: '#E2E8F0',
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.02,
          shadowRadius: 14,
          elevation: 2,
        }}
      >
        <View className="flex-row items-center flex-1 mr-2">
          {/* Soft purple rounded icon container */}
          <View 
            className="w-10 h-10 rounded-2xl items-center justify-center bg-[#F5F3FF] border"
            style={{ borderColor: 'rgba(139, 92, 246, 0.05)' }}
          >
            <ListMusic color="#8B5CF6" size={16} strokeWidth={2.0} />
          </View>

          {/* Title & Metadata */}
          <View className="ml-3 flex-1">
            <Text 
              className="font-bold text-[13px] text-[#0F172A]" 
              numberOfLines={1}
            >
              {playlist.name}
            </Text>
            <Text className="text-[10px] font-semibold text-[#64748B] mt-0.5">
              {displayCount === 0 ? 'Empty' : `${displayCount} cards`}
            </Text>
          </View>
        </View>

        {/* Three dots menu */}
        <TouchableOpacity 
          onPress={onLongPress}
          className="p-1"
        >
          <MoreHorizontal color="#64748B" size={16} />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
});

// -------------------------------------------------------------
// CREATOR MODAL PANEL
// -------------------------------------------------------------
const CreatePlaylistForm = React.memo(({ onClose }: { onClose: () => void }) => {
  const [playlistName, setPlaylistName] = useState('');
  const createPlaylistMutation = useCreatePlaylist();

  const handleCreate = () => {
    const name = playlistName.trim();
    if (!name) {
      Toast.show({ type: 'error', text1: 'Collection name is required' });
      return;
    }
    createPlaylistMutation.mutate(name, {
      onSuccess: () => {
        setPlaylistName('');
        onClose();
        Toast.show({ type: 'success', text1: `Created collection "${name}"` });
      },
      onError: (err) => {
        Toast.show({
          type: 'error',
          text1: 'Could not create collection',
          text2: err instanceof Error ? err.message : 'Try again',
        });
      },
    });
  };

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/25 justify-center items-center px-6" onPress={onClose}>
        <View 
          className="bg-white w-full rounded-[32px] p-6 border bg-white"
          style={{
            borderColor: 'rgba(148,163,184,0.10)',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.03,
            shadowRadius: 18,
            elevation: 3,
          }}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <Text className="text-[#0F172A] text-base font-bold tracking-tight mb-4 text-center">
            Create Custom Collection
          </Text>

          <TextInput
            className="border text-[#0F172A] p-3.5 rounded-2xl text-[14px] mb-5 font-semibold text-center bg-[#FAF9F7]"
            style={{ borderColor: 'rgba(148,163,184,0.12)' }}
            placeholder="e.g. Trees, Dynamic Programming..."
            placeholderTextColor="#94A3B8"
            value={playlistName}
            onChangeText={setPlaylistName}
            autoFocus
            editable={!createPlaylistMutation.isPending}
            maxLength={25}
          />

          <View className="flex-row gap-2.5">
            <TouchableOpacity
              onPress={handleCreate}
              disabled={createPlaylistMutation.isPending}
              activeOpacity={0.8}
              className="flex-1 py-3.5 rounded-2xl items-center justify-center bg-[#8B5CF6]"
              style={{ opacity: createPlaylistMutation.isPending ? 0.7 : 1 }}
            >
              {createPlaylistMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-sm">Create</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              disabled={createPlaylistMutation.isPending}
              activeOpacity={0.85}
              className="flex-1 py-3.5 rounded-2xl items-center justify-center border bg-white"
              style={{ borderColor: 'rgba(148,163,184,0.10)' }}
            >
              <Text className="text-[#64748B] font-semibold text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
});

// -------------------------------------------------------------
// PREMIUM SIGN-IN REQUIRED MODAL
// -------------------------------------------------------------
interface SignInPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignInPromptModal = React.memo(({ isOpen, onClose }: SignInPromptModalProps) => {
  const { login } = useAuthStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSignIn = async () => {
    lightHaptic();
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
        const { deviceId, logicalClockSequence } = usePlaylistStateStore.getState();
        const clockEpoch = String(logicalClockSequence || 0);
        const res = await api.post('/auth/google', { idToken, deviceId, clockEpoch });
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
        Toast.show({ type: 'success', text1: 'Welcome!', text2: `Signed in as ${user.name}` });
      }
    } catch (error: any) {
      console.log("FULL GOOGLE ERROR:", JSON.stringify(error, null, 2));
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        console.error('Google Sign-In Error:', error);
        Toast.show({ type: 'error', text1: 'Authentication Failed', text2: 'Please try again' });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/35 justify-center items-center px-6" onPress={onClose}>
        <View 
          className="bg-white w-full rounded-[32px] p-6 border"
          style={{
            borderColor: 'rgba(148,163,184,0.12)',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.05,
            shadowRadius: 20,
            elevation: 4,
          }}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Top glowing lock icon */}
          <View className="items-center mb-5">
            <View 
              className="w-14 h-14 rounded-2xl items-center justify-center bg-[#F5F3FF] border mb-1"
              style={{ borderColor: 'rgba(139, 92, 246, 0.08)' }}
            >
              <Lock color="#8B5CF6" size={24} strokeWidth={2.0} />
            </View>
          </View>

          {/* Heading */}
          <Text className="text-[#0B1327] text-lg font-black tracking-tight text-center mb-2 leading-tight">
            Sign In Required
          </Text>

          {/* Body */}
          <Text className="text-[#7F8A9E] text-[13px] font-semibold text-center leading-relaxed mb-6 px-4">
            Connect a secure account to create custom playlists, back up your progress, and protect your revision streak.
          </Text>

          {/* Buttons */}
          <View className="gap-2.5">
            <TouchableOpacity
              onPress={handleSignIn}
              disabled={isAuthenticating}
              activeOpacity={0.8}
              className="w-full py-3.5 rounded-2xl items-center justify-center bg-[#8B5CF6]"
              style={{ opacity: isAuthenticating ? 0.75 : 1 }}
            >
              {isAuthenticating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-bold text-sm">Continue with Google</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              disabled={isAuthenticating}
              activeOpacity={0.85}
              className="w-full py-3.5 rounded-2xl items-center justify-center border bg-[#FAF9F7]"
              style={{ borderColor: 'rgba(148,163,184,0.10)' }}
            >
              <Text className="text-[#64748B] font-semibold text-sm">Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
});

// -------------------------------------------------------------
// MEMOIZED ANALYTICS STATISTICS ROW (PREVENTS RERENDERS)
// -------------------------------------------------------------
const AnalyticsStatsRow = React.memo(() => {
  const totalSwipes = useTrackingStore((state) => state.totalSwipes);
  const totalScrolls = useTrackingStore((state) => state.totalScrolls);

  // Compact formatter following exact rules:
  // - 999 -> 999
  // - 1000 -> 1K
  // - 1200 -> 1.2K
  // - 10000 -> 10K
  // - 1250000 -> 1.2M
  // Truncates to 1 decimal place and strips trailing .0
  const formatCompact = (num: number): string => {
    if (num < 1000) return num.toString();
    if (num < 1000000) {
      const val = Math.floor((num / 1000) * 10) / 10;
      return `${val}K`;
    }
    const val = Math.floor((num / 1000000) * 10) / 10;
    return `${val}M`;
  };

  return (
    <View className="flex-row items-center gap-4 mt-3 mb-1">
      <View>
        <Text className="text-[10px] font-bold text-[#7F8A9E] uppercase tracking-wider">Swipes</Text>
        <Text className="text-base font-extrabold text-[#8B5CF6]">{formatCompact(totalSwipes)}</Text>
      </View>
      <View style={{ width: 1, height: 16, backgroundColor: '#E2E8F0' }} />
      <View>
        <Text className="text-[10px] font-bold text-[#7F8A9E] uppercase tracking-wider">Scrolls</Text>
        <Text className="text-base font-extrabold text-[#8B5CF6]">{formatCompact(totalScrolls)}</Text>
      </View>
    </View>
  );
});



const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

// -------------------------------------------------------------
// PRIMARY REVISION BRAIN DASHBOARD
// -------------------------------------------------------------
export default function PersonalScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout, isSessionExpired } = useAuthStore();
  const { triggerBiometricReauth } = useBiometricReauth();
  const syncStatus = usePlaylistStateStore((s) => s.syncStatus);

  const [isTransitionReady, setIsTransitionReady] = useState(true);

  useFocusEffect(
    useCallback(() => {
      interactionScheduler.registerInteraction(); // UI priority block
      setIsTransitionReady(true);
      return () => {
        // Do NOT reset to false on blur to guarantee instant next tab switch with full layout preservation!
      };
    }, [])
  );

  // Local-First Architecture: SyncPauseGate pauses sync automatically when focused

  const { data: playlists = [], isLoading: playlistsLoading, isError: playlistsError, isFetched, refetch } = usePlaylists();
  const { data: stats, isLoading: statsLoading } = useDashboard();

  // Mutations
  const deletePlaylistMutation = useDeletePlaylist();
  const updatePlaylistMutation = useUpdatePlaylist();

  const easyCount = usePlaylistCount('easy');
  const mediumCount = usePlaylistCount('medium');
  const hardCount = usePlaylistCount('hard');
  const skippedCount = usePlaylistCount('skipped');

  const hydrateSmartCounts = usePlaylistStateStore((state) => state.hydrateSmartCounts);

  useEffect(() => {
    if (playlists && playlists.length > 0) {
      const initialCounts: Record<string, number> = {};
      playlists.forEach((p: any) => {
        initialCounts[p.id] = p.itemCount ?? 0;
        if (!['easy', 'medium', 'hard', 'skipped'].includes(p.id)) {
          usePlaylistStateStore.getState().hydrateCustomPlaylistOrder(p.id, p.orderedCardIds || []);
        }
      });
      hydrateSmartCounts(initialCounts);
    }
  }, [playlists, hydrateSmartCounts]);

  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSignInPromptOpen, setIsSignInPromptOpen] = useState(false);
  const [isAnalyticsOverlayOpen, setIsAnalyticsOverlayOpen] = useState(false);

  const totalSwipes = useTrackingStore((state) => state.totalSwipes);
  const totalScrolls = useTrackingStore((state) => state.totalScrolls);

  // Custom long-press menu context
  const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const isGuest = user?.id === 'guest-user';

  // Smart split lists sorted exactly like the reference screenshot grid layout
  const smartPlaylists = useMemo(() => {
    const order = ['hard', 'easy', 'medium', 'skipped'];
    return order
      .map(id => {
        const p = playlists.find(pl => pl.id === id);
        if (!p) return undefined;
        let count = p.itemCount ?? 0;
        if (id === 'easy') count = easyCount ?? 0;
        else if (id === 'medium') count = mediumCount ?? 0;
        else if (id === 'hard') count = hardCount ?? 0;
        else if (id === 'skipped') count = skippedCount ?? 0;
        return {
          ...p,
          itemCount: count,
        };
      })
      .filter((p): p is any => p !== undefined);
  }, [playlists, easyCount, mediumCount, hardCount, skippedCount]);

  const customPlaylists = useMemo(() => {
    return playlists.filter((p) => 
      p && 
      !['easy', 'medium', 'hard', 'skipped'].includes(p.id) &&
      !['easy', 'medium', 'hard', 'skipped'].includes(p.name?.toLowerCase())
    );
  }, [playlists]);

  const handlePressSettings = () => {
    lightHaptic();
    setIsSettingsOpen(true);
  };

  const handleLongPressPlaylist = (pl: any) => {
    setSelectedPlaylist(pl);
    setIsMenuOpen(true);
  };

  const handleDelete = () => {
    if (!selectedPlaylist) return;
    lightHaptic();
    Alert.alert(
      "Delete Collection",
      `Are you sure you want to delete "${selectedPlaylist.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deletePlaylistMutation.mutate(selectedPlaylist.id, {
              onSuccess: () => {
                Toast.show({ type: 'success', text1: `Deleted collection` });
                setIsMenuOpen(false);
                setSelectedPlaylist(null);
              },
              onError: (err) => {
                Toast.show({
                  type: 'error',
                  text1: 'Could not delete',
                  text2: err instanceof Error ? err.message : 'Try again',
                });
              }
            });
          }
        }
      ]
    );
  };

  const handleRename = () => {
    if (!selectedPlaylist) return;
    setRenameValue(selectedPlaylist.name);
    setIsMenuOpen(false);
    setTimeout(() => {
      setIsRenameOpen(true);
    }, 200);
  };

  const submitRename = () => {
    const newName = renameValue.trim();
    if (!newName) {
      Toast.show({ type: 'error', text1: 'Name cannot be empty' });
      return;
    }
    lightHaptic();
    updatePlaylistMutation.mutate(
      { playlistId: selectedPlaylist.id, name: newName },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: `Renamed to "${newName}"` });
          setIsRenameOpen(false);
          setSelectedPlaylist(null);
        },
        onError: (err) => {
          Toast.show({
            type: 'error',
            text1: 'Could not rename',
            text2: err instanceof Error ? err.message : 'Try again',
          });
        }
      }
    );
  };

  const promptSignIn = () => {
    setIsSignInPromptOpen(true);
  };

  if (!isTransitionReady) {
    return (
      <SafeAreaView className="flex-1 bg-[#FAF9F7]" edges={['top', 'left', 'right']}>
        {/* Skeleton Header */}
        <View className="px-6 pb-6 pt-2">
          <View style={{ width: 140, height: 28, backgroundColor: '#E2E8F0', borderRadius: 8, marginBottom: 8 }} />
          <View style={{ width: '80%', height: 16, backgroundColor: '#F1F5F9', borderRadius: 6 }} />
        </View>

        <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
          {/* Smart Playlists Skeleton Grid */}
          <View className="flex-row flex-wrap justify-between mt-4">
            <View style={{ width: '48%', height: 110, backgroundColor: '#E2E8F0', borderRadius: 26, marginBottom: 12 }} />
            <View style={{ width: '48%', height: 110, backgroundColor: '#E2E8F0', borderRadius: 26, marginBottom: 12 }} />
            <View style={{ width: '48%', height: 110, backgroundColor: '#E2E8F0', borderRadius: 26, marginBottom: 12 }} />
            <View style={{ width: '48%', height: 110, backgroundColor: '#E2E8F0', borderRadius: 26, marginBottom: 12 }} />
          </View>

          {/* Custom collections Section Title Skeleton */}
          <View style={{ width: 180, height: 20, backgroundColor: '#E2E8F0', borderRadius: 6, marginTop: 24, marginBottom: 16 }} />

          {/* Custom Collections Skeleton Grid */}
          <View className="flex-row flex-wrap justify-between">
            <View style={{ width: '48%', height: 110, backgroundColor: '#F1F5F9', borderRadius: 26, marginBottom: 12 }} />
            <View style={{ width: '48%', height: 110, backgroundColor: '#F1F5F9', borderRadius: 26, marginBottom: 12 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#FAF9F7]" edges={['top', 'left', 'right']}>
      <SyncPauseGate />
      
      {/* Sleek Minimalist Background Ambient Orbs */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 }}>
        <View
          style={{
            position: 'absolute',
            top: 50,
            right: -120,
            width: 500,
            height: 500,
            borderRadius: 250,
            backgroundColor: 'rgba(139, 92, 246, 0.008)', // Reduced opacity significantly
            filter: Platform.OS === 'web' ? 'blur(100px)' : undefined,
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: 80,
            left: -150,
            width: 450,
            height: 450,
            borderRadius: 225,
            backgroundColor: 'rgba(245, 158, 11, 0.006)', // Reduced opacity significantly
            filter: Platform.OS === 'web' ? 'blur(110px)' : undefined,
          }}
        />
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130, paddingTop: 12 }}
      >
        {/* ==========================================
            OS HEADER SECTION WITH BREATHING STREAK
            ========================================== */}
        <View className="px-6 pb-6 pt-2">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[#0B1327] text-[32px] font-black tracking-tight leading-none">
                My Space
              </Text>
              <Text className="text-[#475569] text-[13px] font-semibold mt-1.5 leading-none">
                Your personal revision deck
              </Text>
            </View>
 
            {/* Streak & Floating Capsule Navigation */}
            <View className="flex-row items-center gap-3">
              <ReeWCharacter state="streak" size={64} />
              <TouchableOpacity
                onPress={handlePressSettings}
                activeOpacity={0.8}
                className="w-8 h-8 rounded-full items-center justify-center bg-white border"
                style={{
                  borderColor: '#E2E8F0',
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.02,
                  shadowRadius: 10,
                  elevation: 1,
                }}
              >
                <Settings2 color="#64748B" size={14} strokeWidth={2.0} />
              </TouchableOpacity>
            </View>
          </View>


        </View>

        {/* ==========================================
            HERO STUDY JOURNAL CARD
            ========================================== */}
        <View className="px-6 mb-6">
          <View 
            className="flex-row items-center justify-between p-6 rounded-[28px] bg-white border"
            style={{
              borderColor: '#E2E8F0',
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.03,
              shadowRadius: 18,
              elevation: 2,
            }}
          >
            {/* Left Column info */}
            <View className="flex-1 mr-4">
              {/* Smiling emoji avatar */}
              <View 
                className="w-10 h-10 rounded-full items-center justify-center bg-[#F5F3FF] mb-3 border border-[#8B5CF6]/5"
              >
                <Smile color="#8B5CF6" size={20} strokeWidth={2.0} />
              </View>

              <Text className="text-[#0B1327] text-base font-bold tracking-tight">
                {getGreeting()}, {user?.name ? user.name.split(' ')[0] : 'there'}
              </Text>
              
              {/* Dynamic Analytics Stats Row (Isolated to avoid page rerenders) */}
              <AnalyticsStatsRow />

              <Text className="text-[#475569] text-xs font-semibold leading-normal mt-1">
                Let's keep the flow going.
              </Text>

              {/* Continue button */}
              <TouchableOpacity
                onPress={() => router.push('/(protected)/(tabs)/reels')}
                activeOpacity={0.85}
                className="flex-row items-center px-4 py-2 rounded-full bg-[#8B5CF6] self-start mt-4 justify-between"
              >
                <Text className="text-white font-bold text-[11px] tracking-tight">
                    Continue Revising
                </Text>
                <ChevronRight color="#FFFFFF" size={11} strokeWidth={3.0} className="ml-2" />
              </TouchableOpacity>
            </View>

            {/* Right Column: Dynamic Vector-styled Illustration */}
            <View className="relative w-24 h-24 items-center justify-center">
              {/* Background circular glow */}
              <View className="absolute w-20 h-20 rounded-full bg-[#8B5CF6]/5 opacity-5" />
              
              {/* Stacking Book Layer 1 */}
              <View 
                className="absolute w-14 h-9 rounded-lg bg-[#E2E8F0] border border-slate-200"
                style={{
                  transform: [{ rotate: '-8deg' }, { translateY: 6 }, { translateX: -4 }],
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.05,
                  shadowRadius: 5,
                }}
              />
              
              {/* Stacking Book Layer 2 */}
              <View 
                className="absolute w-14 h-9 rounded-lg bg-[#CBD5E1] border border-slate-300"
                style={{
                  transform: [{ rotate: '4deg' }, { translateY: -2 }, { translateX: 2 }],
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.05,
                  shadowRadius: 5,
                }}
              />
              
              {/* Stacking Book Layer 3 (Top) */}
              <View 
                className="absolute w-14 h-9 rounded-lg bg-[#F1F5F9] border border-slate-200 items-center justify-center"
                style={{
                  transform: [{ rotate: '-2deg' }, { translateY: -10 }],
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                {/* Book cover spine marker line */}
                <View className="w-8 h-1 bg-[#8B5CF6]/30 rounded-full mb-1" />
                <View className="w-6 h-1 bg-[#8B5CF6]/20 rounded-full" />
              </View>
              
              {/* Plant branch leaf decorations */}
              <View 
                className="absolute w-2 h-5 rounded-full bg-[#10B981]/15"
                style={{
                  top: 14,
                  right: 8,
                  transform: [{ rotate: '25deg' }],
                }}
              />
              <View 
                className="absolute w-1.5 h-3 rounded-full bg-[#10B981]/10"
                style={{
                  top: 28,
                  right: 4,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            </View>
          </View>
        </View>

        {/* ==========================================
            COGNITIVE CORES: 4 PERMANENT SMART CORES
            ========================================== */}
        <View className="px-6 mt-4">
          <Text className="text-[#0B1327] text-[16px] font-black tracking-tight mb-4">
            Focus areas
          </Text>

          {playlistsLoading ? (
            <View className="flex-row flex-wrap gap-4 mb-4">
              {[1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  className="w-[48%] p-5 rounded-[30px] border bg-white h-[100px] justify-between"
                  style={{ borderColor: 'rgba(148,163,184,0.08)' }}
                >
                  <View className="w-8 h-8 rounded-xl bg-slate-100/50" />
                  <View className="h-4 w-12 bg-slate-100/50 rounded-full" />
                </View>
              ))}
            </View>
          ) : (
            <View className="flex-row flex-wrap justify-between">
              {smartPlaylists.map((pl) => (
                <SmartPlaylistCard
                  key={pl.id}
                  playlist={pl}
                  onPress={() => {
                      router.push({
                        pathname: '/(protected)/playlist/[playlistId]',
                        params: { playlistId: pl.id }
                      });
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* ==========================================
            MY PLAYLISTS (SELF-MADE PLAYLISTS ONLY)
            ========================================== */}
        <View className="px-6 mt-6">
          <View className="flex-row items-center justify-between mb-4 mt-2">
            <View className="flex-row items-center gap-2">
              <Folder color="#8B5CF6" size={18} strokeWidth={2.0} />
              <Text className="text-[#0B1327] text-[16px] font-black tracking-tight">
                Playlists
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => isGuest ? promptSignIn() : setIsCreating(true)}
              activeOpacity={0.8}
              className="px-3.5 py-1.5 rounded-full bg-[#F3E8FF]/60 flex-row items-center gap-1"
            >
              <Plus color="#8B5CF6" size={12} strokeWidth={2.5} />
              <Text className="text-[#8B5CF6] font-bold text-[11px]">New playlist</Text>
            </TouchableOpacity>
          </View>

          {playlistsLoading && (
            <View className="flex-row flex-wrap justify-between">
              {[1, 2].map((i) => (
                <View
                  key={i}
                  className="w-[48%] p-5 rounded-[30px] border bg-white h-[100px]"
                  style={{ borderColor: 'rgba(148,163,184,0.08)' }}
                />
              ))}
            </View>
          )}

          {playlistsError && (
            <TouchableOpacity
              onPress={() => refetch()}
              className="p-5 rounded-[30px] border bg-white items-center justify-center"
              style={{ borderColor: 'rgba(148,163,184,0.08)' }}
            >
              <Text className="text-slate-500 text-xs font-semibold">Could not load playlists. Tap to retry.</Text>
            </TouchableOpacity>
          )}

          {!playlistsLoading && !playlistsError && (
            <View className="flex-row flex-wrap justify-between">
              {customPlaylists.map((pl) => (
                <CustomPlaylistCard
                  key={pl.id}
                  playlist={pl}
                  onPress={() => {
                    router.push({
                      pathname: '/(protected)/playlist/[playlistId]',
                      params: { playlistId: pl.id }
                    });
                  }}
                  onLongPress={() => handleLongPressPlaylist(pl)}
                />
              ))}
            </View>
          )}

          {!playlistsLoading && isFetched && customPlaylists.length === 0 && (
            <View 
              className="py-9 items-center bg-white rounded-[30px] border px-6"
              style={{
                borderColor: 'rgba(148,163,184,0.08)',
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.03,
                shadowRadius: 18,
                elevation: 2,
              }}
            >
              <View 
                className="w-12 h-12 rounded-2xl items-center justify-center bg-[#F5F3FF]/40 border mb-4"
                style={{ borderColor: 'rgba(139, 92, 246, 0.04)' }}
              >
                <BookOpen color="#8B5CF6" size={20} strokeWidth={1.8} />
              </View>
              <Text className="text-[#0F172A] font-bold text-sm mb-1.5">No Playlists Yet</Text>
              <Text className="text-[#64748B]/70 text-xs text-center leading-relaxed">
                Create your own path. Bundle topics, key tags, or custom card decks into single peaceful collections.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Settings Panel Overlay */}
      {isSettingsOpen && (
        <MySpaceSettingsOverlay
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* SMALL ELEGANT ANALYTICS OVERLAY MODAL */}
      <Modal
        visible={isAnalyticsOverlayOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAnalyticsOverlayOpen(false)}
      >
        <Pressable 
          className="flex-1 bg-black/25 justify-center items-center px-6" 
          onPress={() => setIsAnalyticsOverlayOpen(false)}
        >
          <View 
            className="bg-white w-full max-w-[280px] rounded-[32px] p-6 border relative overflow-hidden"
            style={{
              borderColor: 'rgba(139, 92, 246, 0.15)',
              shadowColor: '#8B5CF6',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.06,
              shadowRadius: 24,
              elevation: 5,
            }}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {/* Decorative top stripe */}
            <View className="absolute top-0 left-0 right-0 h-1.5 bg-[#8B5CF6]" />

            <Text className="text-[#0B1327] text-base font-black tracking-tight text-center mb-4 mt-2">
              Revision Activity
            </Text>

            <View className="gap-4 py-2">
              <View className="flex-row items-center justify-between bg-[#F5F3FF]/40 border border-[#8B5CF6]/5 rounded-2xl p-4">
                <View className="flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-xl bg-[#F5F3FF] items-center justify-center border border-[#8B5CF6]/10">
                    <Zap color="#8B5CF6" size={14} strokeWidth={2.5} />
                  </View>
                  <Text className="text-sm font-semibold text-[#0B1327]">Total Swipes</Text>
                </View>
                <Text className="text-lg font-black text-[#8B5CF6]">{totalSwipes}</Text>
              </View>

              <View className="flex-row items-center justify-between bg-[#F5F3FF]/40 border border-[#8B5CF6]/5 rounded-2xl p-4">
                <View className="flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-xl bg-[#F5F3FF] items-center justify-center border border-[#8B5CF6]/10">
                    <ListMusic color="#8B5CF6" size={14} strokeWidth={2.5} />
                  </View>
                  <Text className="text-sm font-semibold text-[#0B1327]">Total Scrolls</Text>
                </View>
                <Text className="text-lg font-black text-[#8B5CF6]">{totalScrolls}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                lightHaptic();
                setIsAnalyticsOverlayOpen(false);
              }}
              activeOpacity={0.8}
              className="w-full mt-4 py-3 rounded-2xl bg-[#8B5CF6] items-center"
            >
              <Text className="text-white font-bold text-xs">Dismiss</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Guest Sign-In Prompt Modal Dialog */}
      <SignInPromptModal
        isOpen={isSignInPromptOpen}
        onClose={() => setIsSignInPromptOpen(false)}
      />

      {/* Creation Modal Form Panel */}
      {isCreating && (
        <CreatePlaylistForm onClose={() => setIsCreating(false)} />
      )}

      {/* LONG-PRESS HAPTIC CONTEXT MENU */}
      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
        <Pressable className="flex-1 bg-black/25 justify-end" onPress={() => setIsMenuOpen(false)}>
          <View 
            className="bg-white mx-4 mb-10 rounded-[32px] p-6 border bg-white"
            style={{
              borderColor: 'rgba(148,163,184,0.10)',
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.03,
              shadowRadius: 18,
              elevation: 3,
            }}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Text className="text-[#64748B] text-xs font-semibold text-center mb-5">
              {selectedPlaylist?.name}
            </Text>

            <View className="gap-2.5">
              <TouchableOpacity
                onPress={handleRename}
                activeOpacity={0.85}
                className="w-full py-3.5 rounded-2xl bg-[#FAF9F7] border items-center"
                style={{ borderColor: 'rgba(148,163,184,0.08)' }}
              >
                <Text className="text-[#0F172A] text-sm font-semibold">Rename collection</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDelete}
                activeOpacity={0.85}
                className="w-full py-3.5 rounded-2xl bg-[#FFF5F5] border items-center"
                style={{ borderColor: 'rgba(239, 68, 68, 0.08)' }}
              >
                <Text className="text-[#E11D48] text-sm font-semibold">Delete collection</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsMenuOpen(false)}
                activeOpacity={0.85}
                className="w-full py-3.5 mt-1.5 rounded-2xl bg-white border items-center"
                style={{ borderColor: 'rgba(148,163,184,0.10)' }}
              >
                <Text className="text-[#64748B] text-sm font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* RENAME COLLECTION MODAL PANEL */}
      <Modal visible={isRenameOpen} transparent animationType="fade" onRequestClose={() => setIsRenameOpen(false)}>
        <Pressable className="flex-1 bg-black/25 justify-center items-center px-6" onPress={() => setIsRenameOpen(false)}>
          <View 
            className="bg-white w-full rounded-[32px] p-6 border bg-white"
            style={{
              borderColor: 'rgba(148,163,184,0.10)',
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.03,
              shadowRadius: 18,
              elevation: 3,
            }}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Text className="text-[#0F172A] text-base font-bold tracking-tight mb-4 text-center">
              Rename Collection
            </Text>

            <TextInput
              className="border text-[#0F172A] p-3.5 rounded-2xl text-[14px] mb-5 font-semibold text-center bg-[#FAF9F7]"
              style={{ borderColor: 'rgba(148,163,184,0.12)' }}
              placeholder="Enter name..."
              placeholderTextColor="#94A3B8"
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              maxLength={25}
            />

            <View className="flex-row gap-2.5">
              <TouchableOpacity
                onPress={submitRename}
                activeOpacity={0.8}
                className="flex-1 py-3.5 rounded-2xl items-center justify-center bg-[#8B5CF6]"
              >
                <Text className="text-white font-semibold text-sm">Save</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsRenameOpen(false)}
                activeOpacity={0.85}
                className="flex-1 py-3.5 rounded-2xl items-center justify-center border bg-white"
                style={{ borderColor: 'rgba(148,163,184,0.10)' }}
              >
                <Text className="text-[#64748B] font-semibold text-sm">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
