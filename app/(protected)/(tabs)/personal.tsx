import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ListMusic, Heart, Clock, Settings2, BookOpen, Check } from 'lucide-react-native';
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
} from 'react-native-reanimated';

const SURFACE_GLASS = '#FFFFFF';

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(6);
  }
};

// -------------------------------------------------------------
// REDESIGNED MONOCHROME COLLECTION CARD WITH LIFT SPRING TRANSITION
// -------------------------------------------------------------
interface PlaylistGridCardProps {
  playlist: any;
  onPress: () => void;
  onLongPress: () => void;
}

const PlaylistGridCardComponent = ({ playlist, onPress, onLongPress }: PlaylistGridCardProps) => {
  const loops = playlist.completedLoops || 0;
  const isLikes = playlist.id === 'likes';
  const isWatchLater = playlist.id === 'watch-later';
  const isSystem = isLikes || isWatchLater;
  const name = isLikes ? 'Revised' : playlist.name;

  // Ultra-thin spatial progress bar calculation
  const progressRatio = Math.min(1, (loops * 2.5) / 10);

  // Custom Reanimated spring lift on long-press
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 280 });
  };

  const handleLongPress = () => {
    if (isSystem) return; // Prevent editing Liked Cards & Watch Later
    lightHaptic();
    scale.value = withSpring(1.05, { damping: 10, stiffness: 200 }, () => {
      scale.value = withSpring(1, { damping: 15, stiffness: 250 });
    });
    onLongPress();
  };

  // We assign a muted elegant background color based on the playlist index or name hash:
  const getPlaylistColor = () => {
    if (isLikes) return { bg: '#E6F4EA', border: '#CEEAD6', text: '#137333', bar: '#34A853', iconBg: '#D2EBD9' };
    if (isWatchLater) return { bg: '#EEF2FF', border: '#E0E7FF', text: '#4F46E5', bar: '#6366F1', iconBg: '#DDE2FF' };
    
    // Cycle custom folders/playlists through muted spatial tones (soft violet, muted amber, desaturated teal, soft rose)
    const tones = [
      { bg: '#F5F3FF', border: '#EDE9FE', text: '#6D28D9', bar: '#8B5CF6', iconBg: '#E8E3FF' }, // soft violet
      { bg: '#FFFBEB', border: '#FEF3C7', text: '#B45309', bar: '#F59E0B', iconBg: '#FFF3C2' }, // muted amber
      { bg: '#F0FDFA', border: '#CCFBF1', text: '#0F766E', bar: '#14B8A6', iconBg: '#D1F5EE' }, // desaturated teal
      { bg: '#FFF5F5', border: '#FEE2E2', text: '#B91C1C', bar: '#EF4444', iconBg: '#FFE3E3' }, // soft rose
    ];
    
    const hash = name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    return tones[hash % tones.length];
  };

  const colors = getPlaylistColor();

  return (
    <Animated.View style={[animatedStyle, { width: '48%' }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        className="w-full p-6 rounded-[28px] border shadow-sm shadow-slate-100/5"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        {/* Color-coded premium subtle icon container */}
        <View 
          className="w-8 h-8 rounded-xl items-center justify-center border"
          style={{ backgroundColor: colors.iconBg, borderColor: colors.border }}
        >
          {isLikes ? (
            <Check color={colors.text} size={14} strokeWidth={3} />
          ) : isWatchLater ? (
            <Clock color={colors.text} size={14} strokeWidth={2.2} />
          ) : (
            <ListMusic color={colors.text} size={14} strokeWidth={2.2} />
          )}
        </View>

        <View className="mt-4 mb-0.5">
          <Text 
            className="font-extrabold text-[15px] leading-tight tracking-tight" 
            style={{ color: colors.text }}
            numberOfLines={1}
          >
            {name}
          </Text>
        </View>

        <View className="flex-row items-center justify-between mb-3.5">
          <Text className="text-[11px] font-medium" style={{ color: colors.text, opacity: 0.8 }}>{playlist.itemCount} cards</Text>
          {loops > 0 && (
            <View className="px-2 py-0.5 rounded-full border" style={{ backgroundColor: colors.iconBg, borderColor: colors.border }}>
              <Text className="text-[8px] font-bold uppercase" style={{ color: colors.text }}>x{loops} run</Text>
            </View>
          )}
        </View>

        {/* Spatial micro progress bar matching color-coded indicator */}
        <View className="w-full h-[2.5px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}>
          <View 
            className="h-full rounded-full"
            style={{ 
              backgroundColor: colors.bar,
              width: `${Math.max(6, progressRatio * 100)}%` 
            }} 
          />
        </View>
      </Pressable>
    </Animated.View>
  );
};

const PlaylistGridCard = React.memo(PlaylistGridCardComponent, (prev, next) => {
  return (
    prev.playlist.id === next.playlist.id &&
    prev.playlist.name === next.playlist.name &&
    prev.playlist.itemCount === next.playlist.itemCount &&
    prev.playlist.completedLoops === next.playlist.completedLoops
  );
});

// -------------------------------------------------------------
// MONOCHROME COLLECTION CREATION MODULE
// -------------------------------------------------------------
interface CreatePlaylistFormProps {
  onClose: () => void;
}

const CreatePlaylistFormComponent = ({ onClose }: CreatePlaylistFormProps) => {
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
        Toast.show({ type: 'success', text1: `Created "${name}"`, position: 'top' });
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
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable 
        className="flex-1 bg-black/15 justify-center items-center px-6"
        onPress={onClose}
      >
        <View 
          className="bg-white/95 w-full rounded-[32px] p-6 shadow-xl border border-neutral-100/50"
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <Text className="text-[#111827] text-[15px] font-bold tracking-tight mb-4 text-center">
            Create Collection
          </Text>

          <TextInput
            className="border border-slate-200 text-[#111827] p-3 rounded-2xl text-[14px] mb-5 font-semibold text-center"
            style={{ backgroundColor: '#FAF9F6' }}
            placeholder="Enter collection name..."
            placeholderTextColor="#9CA3AF"
            value={playlistName}
            onChangeText={setPlaylistName}
            autoFocus
            editable={!createPlaylistMutation.isPending}
          />

          <View className="flex-row gap-2.5">
            <SpringPressable
              onPress={handleCreate}
              disabled={createPlaylistMutation.isPending}
              className="flex-1 py-3.5 rounded-2xl items-center justify-center bg-violet-600 shadow-sm"
              style={{ opacity: createPlaylistMutation.isPending ? 0.7 : 1 }}
            >
              {createPlaylistMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-bold text-[13.5px]">Create</Text>
              )}
            </SpringPressable>

            <SpringPressable
              onPress={onClose}
              disabled={createPlaylistMutation.isPending}
              className="flex-1 py-3.5 rounded-2xl items-center justify-center border border-slate-200 bg-white"
            >
              <Text className="text-[#4B5563] font-bold text-[13.5px]">Cancel</Text>
            </SpringPressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const CreatePlaylistForm = React.memo(CreatePlaylistFormComponent);

// -------------------------------------------------------------
// PRIMARY WORKSPACE SCREEN
// -------------------------------------------------------------
export default function PersonalScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();

  const { data: playlists = [], isLoading: playlistsLoading, isError: playlistsError, refetch } = usePlaylists();
  const { data: stats } = useDashboard();

  // Playlist Mutation Hooks
  const deletePlaylistMutation = useDeletePlaylist();
  const updatePlaylistMutation = useUpdatePlaylist();
  const duplicatePlaylistMutation = useDuplicatePlaylist();

  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // States for custom context menu overlay
  const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const isGuest = user?.id === 'guest-user';



  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

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
      "Please sign in to manage collections.",
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
    if (minutes < 60) {
      return `${minutes} min${minutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) {
      return `${hours} hr${hours !== 1 ? 's' : ''}`;
    }
    return `${hours}h ${remainingMins}m`;
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F7]" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1 bg-[#F5F5F7]"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130, paddingTop: 12 }}
      >
        
        {/* Quiet My Space Header Area */}
        <View className="px-6 pb-6">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-[#111827] text-[32px] font-extrabold tracking-tight leading-none">
                My Space
              </Text>
            </View>

            {/* Clean Capsule Floating Navigation Controls */}
            <View className="flex-row gap-2.5 mt-0.5">
              <SpringPressable
                onPress={() => isGuest ? promptSignIn() : setIsCreating(!isCreating)}
                activeScale={0.9}
                className="w-10 h-10 rounded-full items-center justify-center border border-white/60 shadow-sm"
                style={{ backgroundColor: SURFACE_GLASS }}
              >
                <Plus color="#8B5CF6" size={19} strokeWidth={2.5} />
              </SpringPressable>

              <TouchableOpacity
                onPress={handlePressSettings}
                activeOpacity={0.8}
                className="w-10 h-10 rounded-full items-center justify-center border border-white/60 shadow-sm"
                style={{ backgroundColor: SURFACE_GLASS }}
              >
                <Settings2 color="#8B5CF6" size={19} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          </View>
          {/* Apple Fitness-style metric cards */}
          <View className="flex-row gap-4 mt-6">
            <StatsCard
              icon={<Check color="#10B981" size={18} strokeWidth={3} />}
              label="Revised Cards"
              value={`${stats?.totalRevisions ?? 0}`}
              containerClassName="flex-1"
            />
            <StatsCard
              icon={<Clock color="#3B82F6" size={18} strokeWidth={2.5} />}
              label="Time Spent"
              value={formatTotalTime(stats?.totalTimeSpent ?? 0)}
              containerClassName="flex-1"
            />
          </View>
        </View>

        {/* Collections Area */}
        <View className="px-6">
          <Text className="text-[#111827] text-[17px] font-bold tracking-tight mb-4 mt-2">
            Collections
          </Text>

          {playlistsLoading && (
            <View className="flex-row flex-wrap gap-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  className="w-[48%] p-5 rounded-[24px] border border-slate-200/30 h-[124px] justify-between"
                  style={{ backgroundColor: SURFACE_GLASS }}
                >
                  <View className="w-7 h-7 rounded-xl bg-slate-100/80" />
                  <View>
                    <View className="h-4 w-20 bg-slate-100/80 rounded-full mb-2" />
                    <View className="h-3 w-12 bg-slate-100/80 rounded-full" />
                  </View>
                </View>
              ))}
            </View>
          )}

          {playlistsError && (
            <SpringPressable
              onPress={() => refetch()}
              className="mb-6 p-4 rounded-[20px] border border-slate-200/50"
              style={{ backgroundColor: SURFACE_GLASS }}
            >
              <Text className="text-[#6B7280] text-[13.5px]">Could not load collections. Tap to retry.</Text>
            </SpringPressable>
          )}

          {!playlistsLoading && !playlistsError && (
            <View className="flex-row flex-wrap gap-4 mb-8">
              {playlists.map((pl) => (
                <PlaylistGridCard
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

          {!playlistsLoading && playlists.length === 0 && (
            <View
              className="py-12 items-center rounded-[28px] border border-slate-200/40 mb-6 px-6"
              style={{ backgroundColor: SURFACE_GLASS }}
            >
              <BookOpen color="#9CA3AF" size={22} strokeWidth={1.75} />
              <Text className="text-[#111827] font-bold text-[14px] mt-3 mb-1">Your workspace is empty</Text>
              <Text className="text-[#6B7280] text-[12.5px] text-center leading-normal">
                Create custom collections to organize your learning flow.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Premium Sliding Glass control center */}
      <MySpaceSettingsOverlay
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Pop-up Collection Creator */}
      {isCreating && (
        <CreatePlaylistForm onClose={() => setIsCreating(false)} />
      )}

      {/* CUSTOM LONG-PRESS HAPTIC CONTEXT MENU MODAL */}
      <Modal
        visible={isMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <Pressable 
          className="flex-1 bg-black/15 justify-end"
          onPress={() => setIsMenuOpen(false)}
        >
          <View 
            className="bg-white/95 mx-4 mb-10 rounded-[32px] p-6 shadow-xl border border-neutral-100/50"
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Text className="text-neutral-400 text-[10px] font-bold tracking-wider text-center uppercase mb-5">
              {selectedPlaylist?.name}
            </Text>

            <View className="gap-1.5">
              {/* Rename Collection */}
              <SpringPressable
                onPress={handleRename}
                activeScale={0.98}
                className="w-full py-4 rounded-[20px] bg-slate-50/70 border border-slate-100/40 items-center justify-center"
              >
                <Text className="text-[#1F2937] text-[14px] font-semibold">Rename Collection</Text>
              </SpringPressable>

              {/* Duplicate Collection */}
              <SpringPressable
                onPress={handleDuplicate}
                activeScale={0.98}
                className="w-full py-4 rounded-[20px] bg-slate-50/70 border border-slate-100/40 items-center justify-center"
              >
                <Text className="text-[#1F2937] text-[14px] font-semibold">Duplicate Collection</Text>
              </SpringPressable>

              {/* Delete Collection */}
              <SpringPressable
                onPress={handleDelete}
                activeScale={0.98}
                className="w-full py-4 rounded-[20px] bg-rose-50/30 border border-rose-100/20 items-center justify-center"
              >
                <Text className="text-rose-600 text-[14px] font-semibold">Delete Collection</Text>
              </SpringPressable>

              {/* Cancel Option */}
              <SpringPressable
                onPress={() => setIsMenuOpen(false)}
                activeScale={0.98}
                className="w-full py-4 mt-2 rounded-[20px] bg-white border border-slate-200/50 items-center justify-center"
              >
                <Text className="text-neutral-500 text-[14px] font-bold">Cancel</Text>
              </SpringPressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* RENAME INPUT MODAL */}
      <Modal
        visible={isRenameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRenameOpen(false)}
      >
        <Pressable 
          className="flex-1 bg-black/15 justify-center items-center px-6"
          onPress={() => setIsRenameOpen(false)}
        >
          <View 
            className="bg-white/95 w-full rounded-[32px] p-6 shadow-xl border border-neutral-100/50"
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Text className="text-[#111827] text-[15px] font-bold tracking-tight mb-4 text-center">
              Rename Collection
            </Text>

            <TextInput
              className="border border-slate-200 text-[#111827] p-3 rounded-2xl text-[14px] mb-5 font-semibold text-center"
              style={{ backgroundColor: '#FAF9F6' }}
              placeholder="Enter name..."
              placeholderTextColor="#9CA3AF"
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
            />

            <View className="flex-row gap-2.5">
              <SpringPressable
                onPress={submitRename}
                className="flex-1 py-3.5 rounded-2xl items-center justify-center bg-violet-600 shadow-sm"
              >
                <Text className="text-white font-bold text-[13.5px]">Save</Text>
              </SpringPressable>

              <SpringPressable
                onPress={() => setIsRenameOpen(false)}
                className="flex-1 py-3.5 rounded-2xl items-center justify-center border border-slate-200 bg-white"
              >
                <Text className="text-[#4B5563] font-bold text-[13.5px]">Cancel</Text>
              </SpringPressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
