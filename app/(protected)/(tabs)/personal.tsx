import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ListMusic, LogOut, ChevronRight, LogIn, Heart, Clock } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/useAuthStore';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { usePlaylists, useCreatePlaylist } from '@/hooks/usePlaylists';
import { usePersonalLibrary } from '@/hooks/usePersonalLibrary';

const SURFACE = 'rgba(255,255,255,0.82)';

export default function PersonalScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { setActivePlaylistId, resetSession } = useBookmarkStore();

  const { data: playlists = [], isLoading: playlistsLoading, isError: playlistsError, refetch } = usePlaylists();
  const { data: library, isLoading: libraryLoading } = usePersonalLibrary();
  const createPlaylistMutation = useCreatePlaylist();

  const [isCreating, setIsCreating] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

  const favorites = library?.favorites ?? [];

  const isGuest = user?.id === 'guest-user';

  const promptSignIn = () => {
    Alert.alert(
      "Sign In Required",
      "Please sign in to create playlists or save questions to your space.",
      [
        { text: "Maybe Later", style: "cancel" },
        { 
          text: "Sign In", 
          onPress: async () => {
            resetSession();
            queryClient.clear();
            await logout();
          } 
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          resetSession();
          queryClient.clear();
          await logout();
        },
      },
    ]);
  };

  const handleCreate = () => {
    const name = playlistName.trim();
    if (!name) {
      Toast.show({ type: 'error', text1: 'Playlist name cannot be empty' });
      return;
    }
    createPlaylistMutation.mutate(name, {
      onSuccess: () => {
        setPlaylistName('');
        setIsCreating(false);
        Toast.show({ type: 'success', text1: `Created "${name}"`, position: 'top' });
      },
      onError: (err) => {
        Toast.show({
          type: 'error',
          text1: 'Could not create playlist',
          text2: err instanceof Error ? err.message : 'Try again',
        });
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F8FAFC]" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1 bg-[#F8FAFC]"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View className="px-5 pt-3 pb-6">
          <View className="flex-row items-start justify-between mb-1">
            <View className="flex-1 pr-4">
              <Text className="text-[#0F172A] text-[34px] font-normal tracking-tight">My Space</Text>
              <Text className="text-[#64748B] text-[16px] leading-relaxed mt-3 max-w-[300px]">
                Playlists and saved questions from your account.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => isGuest ? promptSignIn() : setIsCreating(!isCreating)}
              className="w-11 h-11 rounded-2xl items-center justify-center border border-slate-100/80"
              style={{ backgroundColor: SURFACE }}
            >
              <Plus color="#8B5CF6" size={20} strokeWidth={1.75} />
            </TouchableOpacity>
          </View>

          {isCreating && (
            <View
              className="mt-6 p-6 rounded-[24px] border border-slate-100/60"
              style={{ backgroundColor: SURFACE }}
            >
              <Text className="text-[#64748B] text-[13px] mb-3">New playlist</Text>
              <TextInput
                className="border border-slate-100 text-[#0F172A] p-4 rounded-2xl text-[16px] mb-4"
                style={{ backgroundColor: '#F8FAFC' }}
                placeholder="e.g. Graph sprint, Amazon prep..."
                placeholderTextColor="#94A3B8"
                value={playlistName}
                onChangeText={setPlaylistName}
                editable={!createPlaylistMutation.isPending}
              />
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleCreate}
                  disabled={createPlaylistMutation.isPending}
                  className="flex-1 py-3.5 rounded-2xl items-center"
                  style={{ backgroundColor: '#8B5CF6', opacity: createPlaylistMutation.isPending ? 0.7 : 1 }}
                >
                  {createPlaylistMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-normal text-[15px]">Create</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsCreating(false)}
                  className="flex-1 py-3.5 rounded-2xl items-center border border-slate-100"
                  style={{ backgroundColor: '#F8FAFC' }}
                >
                  <Text className="text-[#64748B] font-normal text-[15px]">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View className="px-5">
          <Text className="text-[#0F172A] text-[22px] font-normal tracking-tight mb-4">
            Revision Playlists
          </Text>

          {playlistsLoading && (
            <ActivityIndicator color="#8B5CF6" style={{ marginBottom: 24 }} />
          )}

          {playlistsError && (
            <TouchableOpacity
              onPress={() => refetch()}
              className="mb-6 p-4 rounded-[22px] border border-slate-100"
              style={{ backgroundColor: SURFACE }}
            >
              <Text className="text-[#64748B] text-[15px]">Could not load playlists. Tap to retry.</Text>
            </TouchableOpacity>
          )}

          <View className="flex-row flex-wrap gap-3 mb-10">
            {playlists.map((pl) => {
              const loops = pl.completedLoops || 0;
              const isLikes = pl.id === 'likes';
              const isWatchLater = pl.id === 'watch-later';

              return (
                <TouchableOpacity
                  key={pl.id}
                  activeOpacity={0.9}
                  onPress={() => {
                    router.push({
                      pathname: '/(protected)/playlist/[playlistId]',
                      params: { playlistId: pl.id }
                    });
                  }}
                  className="w-[48%] p-5 rounded-[24px] border border-slate-100/60"
                  style={{ backgroundColor: SURFACE }}
                >
                  {isLikes ? (
                    <Heart color="#f43f5e" fill="#f43f5e" size={17} strokeWidth={1.75} />
                  ) : isWatchLater ? (
                    <Clock color="#3b82f6" size={17} strokeWidth={1.75} />
                  ) : (
                    <ListMusic color={pl.color1} size={17} strokeWidth={1.75} />
                  )}
                  <View className="flex-row items-center mt-4 mb-0.5">
                    <Text className="text-[#0F172A] font-normal text-[16px] flex-1" numberOfLines={2}>
                      {pl.name}
                    </Text>
                    {loops > 0 && (
                      <View className="bg-violet-100 px-1.5 py-0.5 rounded-full ml-1">
                        <Text className="text-violet-600 text-[8px] font-bold">x{loops}</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-[#94A3B8] text-[13px]">{pl.itemCount} cards</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text className="text-[#0F172A] text-[22px] font-normal tracking-tight mb-4">
            Saved Questions
          </Text>

          {libraryLoading && <ActivityIndicator color="#8B5CF6" style={{ marginBottom: 16 }} />}

          {favorites.map((entry) => {
            if (!entry?.card?._id || !entry.card.title) return null;
            return (
              <TouchableOpacity
                key={entry.progressId}
                activeOpacity={0.9}
                onPress={() =>
                  router.push({
                    pathname: '/(protected)/(tabs)/reels',
                    params: { search: entry.card.title },
                  })
                }
                className="flex-row items-center justify-between p-5 mb-2.5 rounded-[22px] border border-slate-100/60"
                style={{ backgroundColor: SURFACE }}
              >
                <View className="flex-1 pr-4">
                  <Text className="text-[#94A3B8] text-[13px] mb-0.5">{entry.card.topic}</Text>
                  <Text className="text-[#0F172A] text-[16px] font-normal" numberOfLines={1}>
                    {entry.card.title}
                  </Text>
                </View>
                <ChevronRight color="#CBD5E1" size={18} strokeWidth={1.75} />
              </TouchableOpacity>
            );
          })}

          {!libraryLoading && favorites.length === 0 && !playlistsLoading && playlists.length === 0 && (
            <View
              className="py-12 items-center rounded-[24px] border border-slate-100/60 mb-8"
              style={{ backgroundColor: SURFACE }}
            >
              <Text className="text-[#0F172A] font-normal text-base mb-1">Your space is empty</Text>
              <Text className="text-[#64748B] text-[15px] text-center px-8 leading-relaxed">
                Create a playlist or favorite cards while revising.
              </Text>
            </View>
          )}

          {!libraryLoading && favorites.length === 0 && playlists.length > 0 && (
            <Text className="text-[#94A3B8] text-[14px] mb-8 leading-relaxed">
              Favorite cards in Reels to see them here.
            </Text>
          )}
        </View>

        <View className="px-5 pt-4 pb-6">
          <TouchableOpacity
            onPress={isGuest ? promptSignIn : handleLogout}
            activeOpacity={0.9}
            className="flex-row items-center justify-center py-4 rounded-[22px] border border-slate-200"
            style={{ backgroundColor: SURFACE }}
          >
            {isGuest ? (
              <LogIn color="#64748B" size={18} strokeWidth={1.75} />
            ) : (
              <LogOut color="#64748B" size={18} strokeWidth={1.75} />
            )}
            <Text className="text-[#64748B] text-[16px] font-normal ml-2">
              {isGuest ? 'Sign in' : 'Sign out'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
