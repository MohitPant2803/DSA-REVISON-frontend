import React, { useState, useMemo, useEffect } from 'react';
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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  ListMusic,
  Clock,
  Settings2,
  BookOpen,
  Check,
  Flame,
  Zap,
  Skull,
  SkipForward,
  Sparkles,
  TrendingUp,
  Brain,
  Compass,
  ArrowRight,
  ShieldCheck,
  Lock,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylists, useCreatePlaylist, useDeletePlaylist, useUpdatePlaylist, useDuplicatePlaylist } from '@/hooks/usePlaylists';
import { useDashboard } from '@/hooks/useDashboard';
import { MySpaceSettingsOverlay } from '@/components/SettingsOverlay';
import { StatsCard } from '@/components/StatsCard';
import { SpringPressable } from '@/components/SpringPressable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

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
  const isHard = playlist.id === 'hard';
  const hasItems = (playlist.itemCount ?? 0) > 0;
  
  // Spring lift configurations on touch
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.45);

  useEffect(() => {
    // Soft idle breathing glow for smart playlists
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.65, { duration: 1500 }),
        withTiming(0.35, { duration: 1500 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(glowOpacity);
  }, []);

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 20, stiffness: 350 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1.0, { damping: 18, stiffness: 280 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const getCardTheme = () => {
    switch (playlist.id) {
      case 'easy':
        return {
          bg: '#E6F4EA',
          border: 'rgba(52, 168, 83, 0.25)',
          text: '#137333',
          iconBg: '#D2EBD9',
          glow: 'rgba(52, 168, 83, 0.4)',
          icon: Flame,
        };
      case 'medium':
        return {
          bg: '#FFFBEB',
          border: 'rgba(245, 158, 11, 0.25)',
          text: '#B45309',
          iconBg: '#FFF3C2',
          glow: 'rgba(245, 158, 11, 0.4)',
          icon: Zap,
        };
      case 'hard':
        return {
          bg: '#FFF5F5',
          border: 'rgba(239, 68, 68, 0.25)',
          text: '#B91C1C',
          iconBg: '#FFE3E3',
          glow: 'rgba(239, 68, 68, 0.4)',
          icon: Skull,
        };
      case 'skipped':
      default:
        return {
          bg: '#F8FAFC',
          border: 'rgba(100, 116, 139, 0.2)',
          text: '#475569',
          iconBg: '#E2E8F0',
          glow: 'rgba(100, 116, 139, 0.15)',
          icon: SkipForward,
        };
    }
  };

  const theme = getCardTheme();
  const IconComponent = theme.icon;

  return (
    <Animated.View style={[animatedStyle, { width: '48%', marginBottom: 12 }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        className="w-full p-5 rounded-[28px] border relative overflow-hidden"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
        }}
      >
        {/* Soft Glowing Neon Aura */}
        <Animated.View
          style={[
            glowStyle,
            {
              position: 'absolute',
              top: -20,
              right: -20,
              width: 70,
              height: 70,
              borderRadius: 35,
              backgroundColor: theme.glow,
              filter: Platform.OS === 'web' ? 'blur(16px)' : undefined,
              opacity: 0.35,
            },
          ]}
        />

        {/* Header containing icon and indicator */}
        <View className="flex-row items-center justify-between">
          <View
            className="w-8 h-8 rounded-xl items-center justify-center border"
            style={{ backgroundColor: theme.iconBg, borderColor: theme.border }}
          >
            <IconComponent color={theme.text} size={15} strokeWidth={2.5} />
          </View>
          
          {isHard && hasItems && (
            <View className="px-2 py-0.5 rounded-full bg-rose-500 shadow-sm shadow-rose-200">
              <Text className="text-[8px] font-extrabold text-white uppercase tracking-wider">Focus</Text>
            </View>
          )}
        </View>

        <Text className="text-[26px] font-black tracking-tight mt-5 leading-none" style={{ color: theme.text }}>
          {playlist.itemCount ?? 0}
        </Text>

        <Text className="font-extrabold text-[12px] uppercase tracking-wider mt-1" style={{ color: theme.text, opacity: 0.7 }}>
          {playlist.name}
        </Text>
      </Pressable>
    </Animated.View>
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
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1.0, { damping: 18, stiffness: 280 });
  };

  const handleLongPress = () => {
    lightHaptic();
    scale.value = withSequence(
      withSpring(1.05, { damping: 10, stiffness: 200 }),
      withSpring(1.0, { damping: 15, stiffness: 250 })
    );
    onLongPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Muted tones for custom playlists to separate them visually from system cores
  const getCustomTheme = () => {
    const tones = [
      { bg: '#F5F3FF', border: 'rgba(109, 40, 217, 0.15)', text: '#6D28D9', bar: '#8B5CF6', iconBg: '#E8E3FF' }, // soft violet
      { bg: '#ECFDF5', border: 'rgba(16, 185, 129, 0.15)', text: '#047857', bar: '#10B981', iconBg: '#D1FAE5' }, // soft emerald
      { bg: '#EFF6FF', border: 'rgba(59, 130, 246, 0.15)', text: '#1D4ED8', bar: '#3B82F6', iconBg: '#DBEAFE' }, // soft blue
      { bg: '#FFF5F5', border: 'rgba(239, 68, 68, 0.15)', text: '#B91C1C', bar: '#EF4444', iconBg: '#FFE3E3' }, // soft rose
    ];

    const hash = (playlist.name || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    return tones[hash % tones.length];
  };

  const colors = getCustomTheme();

  return (
    <Animated.View style={[animatedStyle, { width: '48%', marginBottom: 12 }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        className="w-full p-5 rounded-[28px] border shadow-sm shadow-slate-100/5 bg-white"
        style={{ borderColor: colors.border }}
      >
        <View 
          className="w-8 h-8 rounded-xl items-center justify-center border"
          style={{ backgroundColor: colors.iconBg, borderColor: colors.border }}
        >
          <ListMusic color={colors.text} size={14} strokeWidth={2.5} />
        </View>

        <Text 
          className="font-extrabold text-[14px] leading-tight tracking-tight mt-5 text-[#0F172A]" 
          numberOfLines={1}
        >
          {playlist.name}
        </Text>

        <Text className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
          {playlist.itemCount ?? 0} cards
        </Text>
      </Pressable>
    </Animated.View>
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
      <Pressable className="flex-1 bg-black/35 justify-center items-center px-6" onPress={onClose}>
        <View 
          className="bg-white w-full rounded-[32px] p-6 shadow-2xl border border-slate-100"
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <Text className="text-[#0F172A] text-base font-bold tracking-tight mb-4 text-center">
            Create Custom Collection
          </Text>

          <TextInput
            className="border border-slate-200 text-[#0F172A] p-3.5 rounded-2xl text-[14px] mb-5 font-semibold text-center bg-slate-50"
            placeholder="e.g. Dynamic Programming, Graph Core"
            placeholderTextColor="#94A3B8"
            value={playlistName}
            onChangeText={setPlaylistName}
            autoFocus
            editable={!createPlaylistMutation.isPending}
          />

          <View className="flex-row gap-2.5">
            <SpringPressable
              onPress={handleCreate}
              disabled={createPlaylistMutation.isPending}
              className="flex-1 py-3.5 rounded-2xl items-center justify-center bg-[#8B5CF6] shadow-md shadow-violet-200"
              style={{ opacity: createPlaylistMutation.isPending ? 0.7 : 1 }}
            >
              {createPlaylistMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-bold text-xs">Create Archive</Text>
              )}
            </SpringPressable>

            <SpringPressable
              onPress={onClose}
              disabled={createPlaylistMutation.isPending}
              className="flex-1 py-3.5 rounded-2xl items-center justify-center border border-slate-200 bg-white"
            >
              <Text className="text-slate-500 font-bold text-xs">Cancel</Text>
            </SpringPressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
});

// -------------------------------------------------------------
// PRIMARY REVISION BRAIN DASHBOARD
// -------------------------------------------------------------
export default function PersonalScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();

  const { data: playlists = [], isLoading: playlistsLoading, isError: playlistsError, refetch } = usePlaylists();
  const { data: stats, isLoading: statsLoading } = useDashboard();

  // Mutations
  const deletePlaylistMutation = useDeletePlaylist();
  const updatePlaylistMutation = useUpdatePlaylist();
  const duplicatePlaylistMutation = useDuplicatePlaylist();

  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Custom long-press menu context
  const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const isGuest = user?.id === 'guest-user';

  // Floating background ambient glowing orb shared value
  const bgFloatY = useSharedValue(0);
  useEffect(() => {
    bgFloatY.value = withRepeat(
      withSequence(
        withTiming(15, { duration: 4000 }),
        withTiming(-15, { duration: 4000 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(bgFloatY);
  }, []);

  const ambientOrbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bgFloatY.value }],
  }));

  // Smart split lists
  const smartPlaylists = useMemo(() => {
    return playlists.filter((p) => ['easy', 'medium', 'hard', 'skipped'].includes(p.id));
  }, [playlists]);

  const customPlaylists = useMemo(() => {
    return playlists.filter((p) => !['easy', 'medium', 'hard', 'skipped'].includes(p.id));
  }, [playlists]);

  const handlePressSettings = () => {
    lightHaptic();
    setIsSettingsOpen(true);
  };

  const handleLongPressPlaylist = (pl: any) => {
    setSelectedPlaylist(pl);
    setIsMenuOpen(true);
  };

  const handleDuplicate = () => {
    if (!selectedPlaylist) return;
    lightHaptic();
    duplicatePlaylistMutation.mutate(selectedPlaylist.id, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: `Duplicated "${selectedPlaylist.name}"` });
        setIsMenuOpen(false);
        setSelectedPlaylist(null);
      },
      onError: (err) => {
        Toast.show({
          type: 'error',
          text1: 'Could not duplicate',
          text2: err instanceof Error ? err.message : 'Try again',
        });
      }
    });
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
    Alert.alert(
      "Sign In Required",
      "Please sign in with a secure account to create custom playlists, back up archives, and keep streaking.",
      [
        { text: "Maybe Later", style: "cancel" },
        { 
          text: "Sign In", 
          onPress: async () => {
            queryClient.clear();
            await logout();
          } 
        }
      ]
    );
  };

  const formatTotalTime = (totalSeconds: number): string => {
    if (!totalSeconds || totalSeconds <= 0) return '0 min';
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return remainingMins === 0 ? `${hours} hr${hours !== 1 ? 's' : ''}` : `${hours}h ${remainingMins}m`;
  };

  const handleStreakTap = () => {
    lightHaptic();
    Toast.show({
      type: 'info',
      text1: 'Streak Tracker Active',
      text2: 'Do at least 1 revision card daily to protect your memory streak!',
      position: 'top',
    });
  };

  // Mock revision resurfacing list for instant high-end visuals in empty states
  const suggestedResurfacings = useMemo(() => {
    return [
      { id: 'mock-1', title: 'Dynamic Programming: 0/1 Knapsack', difficulty: 'Hard', topic: 'DP', time: 'Last seen 4 days ago', decay: 'Decay: 78%' },
      { id: 'mock-2', title: 'Graph BFS: Shortest Path in Matrix', difficulty: 'Medium', topic: 'Graphs', time: 'Last seen 2 days ago', decay: 'Decay: 42%' },
      { id: 'mock-3', title: 'Two Sum: Two Pointer Approach', difficulty: 'Easy', topic: 'Arrays', time: 'Last seen 1 week ago', decay: 'Decay: 90%' },
    ];
  }, []);

  const handleStartSuggested = (topic: string) => {
    lightHaptic();
    Toast.show({
      type: 'success',
      text1: 'Launching AI Memory Deck',
      text2: `Queue built for: ${topic}`,
      position: 'top',
    });
    router.push('/(protected)/(tabs)/reels');
  };

  return (
    <SafeAreaView className="flex-1 bg-[#FAF9F6]" edges={['top', 'left', 'right']}>
      
      {/* Sleek Futuristic Background Ambient Orbs */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 }}>
        <Animated.View
          style={[
            ambientOrbStyle,
            {
              position: 'absolute',
              top: 50,
              right: -100,
              width: 300,
              height: 300,
              borderRadius: 150,
              backgroundColor: 'rgba(139, 92, 246, 0.05)',
              filter: Platform.OS === 'web' ? 'blur(80px)' : undefined,
            },
          ]}
        />
        <Animated.View
          style={[
            ambientOrbStyle,
            {
              position: 'absolute',
              bottom: 100,
              left: -120,
              width: 320,
              height: 320,
              borderRadius: 160,
              backgroundColor: 'rgba(16, 185, 129, 0.04)',
              filter: Platform.OS === 'web' ? 'blur(85px)' : undefined,
            },
          ]}
        />
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130, paddingTop: 8 }}
      >
        {/* ==========================================
            OS HEADER SECTION WITH BREATHING STREAK
            ========================================== */}
        <View className="px-6 pb-4">
          <View className="flex-row items-center justify-between">
            <View>
              {/* Online indicator node */}
              <View className="flex-row items-center gap-1.5 mb-1 bg-emerald-50 border border-emerald-200/50 rounded-full px-2 py-0.5 self-start">
                <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <Text className="text-emerald-700 text-[9px] font-black uppercase tracking-wider">Synced to Brain</Text>
              </View>

              <Text className="text-[#0F172A] text-[28px] font-black tracking-tight leading-tight">
                Revision OS
              </Text>
              <Text className="text-slate-400 text-xs font-semibold">
                Spaced-Repetition Kernel v1.2
              </Text>
            </View>

            {/* Streak & Floating Capsule Navigation */}
            <View className="flex-row items-center gap-2.5">
              {/* Breathing Orange/Red Streak 🔥 */}
              <SpringPressable
                onPress={handleStreakTap}
                activeScale={0.92}
                className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-full border border-amber-200/50 bg-[#FFFBEB] shadow-sm shadow-amber-100"
              >
                <Flame color="#F59E0B" size={15} strokeWidth={2.8} />
                <Text className="text-[#B45309] font-black text-xs tracking-tight">
                  {stats?.streakCount ?? 4} Days
                </Text>
              </SpringPressable>

              <SpringPressable
                onPress={handlePressSettings}
                activeScale={0.9}
                className="w-9 h-9 rounded-full items-center justify-center border border-slate-200 bg-white shadow-sm"
              >
                <Settings2 color="#64748B" size={16} strokeWidth={2.2} />
              </SpringPressable>
            </View>
          </View>

          {/* Metric widgets */}
          <View className="flex-row gap-4 mt-6">
            <StatsCard
              icon={<Check color="#10B981" size={18} strokeWidth={3} />}
              label="Revised Cards"
              value={`${stats?.totalRevisions ?? 0}`}
              containerClassName="flex-1 rounded-[24px] border border-slate-100/50 bg-white"
            />
            <StatsCard
              icon={<Clock color="#3B82F6" size={18} strokeWidth={2.5} />}
              label="Revision Time"
              value={formatTotalTime(stats?.totalTimeSpent ?? 0)}
              containerClassName="flex-1 rounded-[24px] border border-slate-100/50 bg-white"
            />
          </View>
        </View>

        {/* ==========================================
            COGNITIVE CORES: 4 PERMANENT SMART CORES
            ========================================== */}
        <View className="px-6 mt-4">
          <Text className="text-[#0F172A] text-[15px] font-black uppercase tracking-wider mb-3">
            Pinned Memory Cores
          </Text>

          {playlistsLoading ? (
            <View className="flex-row flex-wrap gap-4 mb-4">
              {[1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  className="w-[48%] p-5 rounded-[28px] border border-slate-200 bg-slate-50 h-[100px] justify-between animate-pulse"
                >
                  <View className="w-8 h-8 rounded-xl bg-slate-100" />
                  <View className="h-4 w-12 bg-slate-100 rounded-full" />
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
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <Compass color="#8B5CF6" size={16} strokeWidth={2.5} />
              <Text className="text-[#0F172A] text-[15px] font-black uppercase tracking-wider">
                My Playlists
              </Text>
            </View>

            <SpringPressable
              onPress={() => isGuest ? promptSignIn() : setIsCreating(true)}
              activeScale={0.9}
              className="px-3.5 py-1.5 rounded-full border border-violet-100 bg-[#F5F3FF] shadow-sm flex-row items-center gap-1.5"
            >
              <Plus color="#8B5CF6" size={12} strokeWidth={3} />
              <Text className="text-[#8B5CF6] font-extrabold text-[10px] uppercase tracking-wider">New Playlist</Text>
            </SpringPressable>
          </View>

          {playlistsLoading && (
            <View className="flex-row flex-wrap justify-between">
              {[1, 2].map((i) => (
                <View
                  key={i}
                  className="w-[48%] p-5 rounded-[28px] border border-slate-200 bg-slate-50 h-[100px] animate-pulse"
                />
              ))}
            </View>
          )}

          {playlistsError && (
            <TouchableOpacity
              onPress={() => refetch()}
              className="p-5 rounded-[28px] border border-slate-200 bg-white items-center justify-center"
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

          {!playlistsLoading && customPlaylists.length === 0 && (
            <View className="py-8 items-center bg-white rounded-[28px] border border-slate-100/60 px-6">
              <BookOpen color="#94A3B8" size={24} strokeWidth={1.5} style={{ opacity: 0.8 }} />
              <Text className="text-[#0F172A] font-extrabold text-sm mt-3 mb-1">No Playlists Yet</Text>
              <Text className="text-slate-400 text-xs text-center leading-normal">
                Create custom playlists dynamically to bundle tags, companies, or test preparations together.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Settings Panel Overlay */}
      <MySpaceSettingsOverlay
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Creation Modal Form Panel */}
      {isCreating && (
        <CreatePlaylistForm onClose={() => setIsCreating(false)} />
      )}

      {/* LONG-PRESS HAPTIC CONTEXT MENU */}
      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
        <Pressable className="flex-1 bg-black/25 justify-end" onPress={() => setIsMenuOpen(false)}>
          <View 
            className="bg-white mx-4 mb-10 rounded-[32px] p-6 shadow-2xl border border-slate-100"
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Text className="text-slate-400 text-[10px] font-black tracking-wider text-center uppercase mb-5">
              {selectedPlaylist?.name}
            </Text>

            <View className="gap-2">
              <SpringPressable
                onPress={handleRename}
                activeScale={0.97}
                className="w-full py-4 rounded-[20px] bg-slate-50 border border-slate-100 items-center"
              >
                <Text className="text-[#0F172A] text-xs font-extrabold">Rename Collection</Text>
              </SpringPressable>

              <SpringPressable
                onPress={handleDuplicate}
                activeScale={0.97}
                className="w-full py-4 rounded-[20px] bg-slate-50 border border-slate-100 items-center"
              >
                <Text className="text-[#0F172A] text-xs font-extrabold">Duplicate Collection</Text>
              </SpringPressable>

              <SpringPressable
                onPress={handleDelete}
                activeScale={0.97}
                className="w-full py-4 rounded-[20px] bg-rose-50 border border-rose-100 items-center"
              >
                <Text className="text-rose-600 text-xs font-extrabold">Delete Collection</Text>
              </SpringPressable>

              <SpringPressable
                onPress={() => setIsMenuOpen(false)}
                activeScale={0.97}
                className="w-full py-4 mt-2 rounded-[20px] bg-white border border-slate-200 items-center"
              >
                <Text className="text-slate-500 text-xs font-extrabold">Cancel</Text>
              </SpringPressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* RENAME COLLECTION MODAL PANEL */}
      <Modal visible={isRenameOpen} transparent animationType="fade" onRequestClose={() => setIsRenameOpen(false)}>
        <Pressable className="flex-1 bg-black/25 justify-center items-center px-6" onPress={() => setIsRenameOpen(false)}>
          <View 
            className="bg-white w-full rounded-[32px] p-6 shadow-2xl border border-slate-100"
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Text className="text-[#0F172A] text-base font-bold tracking-tight mb-4 text-center">
              Rename Collection
            </Text>

            <TextInput
              className="border border-slate-200 text-[#0F172A] p-3.5 rounded-2xl text-[14px] mb-5 font-semibold text-center bg-slate-50"
              placeholder="Enter name..."
              placeholderTextColor="#94A3B8"
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
            />

            <View className="flex-row gap-2.5">
              <SpringPressable
                onPress={submitRename}
                className="flex-1 py-3.5 rounded-2xl items-center justify-center bg-[#8B5CF6] shadow-md shadow-violet-200"
              >
                <Text className="text-white font-bold text-xs">Save</Text>
              </SpringPressable>

              <SpringPressable
                onPress={() => setIsRenameOpen(false)}
                className="flex-1 py-3.5 rounded-2xl items-center justify-center border border-slate-200 bg-white"
              >
                <Text className="text-slate-500 font-bold text-xs">Cancel</Text>
              </SpringPressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
