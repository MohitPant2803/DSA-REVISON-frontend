import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  StyleSheet,
  Dimensions,
  Vibration,
  Platform,
} from 'react-native';
import { X, ListMusic, Check, Lock } from 'lucide-react-native';
import { usePlaylists, useCreatePlaylist, useTogglePlaylistItem } from '@/hooks/usePlaylists';
import { useCardPlaylistMembership } from '@/hooks/usePlaylistMembership';
import { useAuthStore } from '@/store/useAuthStore';
import Toast from 'react-native-toast-message';
import type { IPopulatedRevisionCard } from '@/types/revision';

const { width, height } = Dimensions.get('window');

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(12);
  } else {
    Vibration.vibrate(8);
  }
};

interface PlaylistPickerModalProps {
  card: IPopulatedRevisionCard | null;
  onClose: () => void;
}

export const PlaylistPickerModal = React.memo(({ card, onClose }: PlaylistPickerModalProps) => {
  const { user } = useAuthStore();
  const isGuest = user?.id === 'guest-user';

  const { data: playlists = [], refetch: refetchPlaylists } = usePlaylists();
  const createPlaylistMutation = useCreatePlaylist();
  const togglePlaylistItem = useTogglePlaylistItem();

  // Local state for checking memberships and quick inputs
  const [tempMembership, setTempMembership] = useState<Record<string, boolean>>({});
  const [isPlaylistSubmitting, setIsPlaylistSubmitting] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylistInline, setIsCreatingPlaylistInline] = useState(false);

  // Fetch playlist memberships for the current card
  const { data: membership, isPending: membershipLoading } = useCardPlaylistMembership(
    card?._id || '',
    !!card
  );

  // Reset and sync tempMembership whenever the active card or its memberships change
  useEffect(() => {
    if (membership && card) {
      setTempMembership(membership);
    } else {
      setTempMembership({});
    }
    setNewPlaylistName('');
  }, [membership, card]);

  const handleCreatePlaylistInline = async () => {
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    try {
      lightHaptic();
      setIsCreatingPlaylistInline(true);
      const newPlaylist = await createPlaylistMutation.mutateAsync(trimmed);
      setNewPlaylistName('');
      
      if (newPlaylist && newPlaylist._id) {
        setTempMembership((prev) => ({
          ...prev,
          [newPlaylist._id]: true,
        }));
      }
      
      Toast.show({
        type: 'success',
        text1: 'Playlist Created',
        text2: `"${trimmed}" created and checked!`,
        position: 'top',
        visibilityTime: 2000,
      });
    } catch (err: any) {
      console.error('[Playlist Inline Create Error]', err);
      Toast.show({
        type: 'error',
        text1: 'Failed to create playlist',
        text2: err.message || 'Please try again.',
        position: 'top',
      });
    } finally {
      setIsCreatingPlaylistInline(false);
    }
  };

  const handleSubmitPlaylists = async () => {
    if (isGuest) return;
    if (!membership || !card) return;

    setIsPlaylistSubmitting(true);
    lightHaptic();

    const cleanCardId = card._id.split('-loop-')[0];

    try {
      for (const playlist of playlists) {
        if (['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].includes(playlist.id)) continue;
        const wasAdded = !!membership[playlist.id];
        const isAddedNow = !!tempMembership[playlist.id];

        if (wasAdded !== isAddedNow) {
          await togglePlaylistItem.mutateAsync({
            playlistId: playlist.id,
            revisionCardId: cleanCardId,
            isInPlaylist: wasAdded,
          });
        }
      }

      Toast.show({
        type: 'success',
        text1: 'Playlists Saved',
        text2: 'Playlists membership updated successfully.',
        position: 'top',
        visibilityTime: 2000,
      });

      onClose();
    } catch (err: any) {
      console.error('[PLAYLIST SUBMIT OVERALL ERROR]', err);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err.message || 'Could not update playlist membership.',
        position: 'top',
      });
    } finally {
      setIsPlaylistSubmitting(false);
    }
  };

  const handleLogout = async () => {
    onClose();
    await useAuthStore.getState().logout();
  };

  return (
    <Modal
      visible={!!card}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        {/* Backdrop Touch to Dismiss */}
        <TouchableOpacity 
          style={StyleSheet.absoluteFillObject} 
          activeOpacity={1} 
          onPress={onClose} 
        />

        <View style={styles.modalContent}>
          <View className="flex-row items-center justify-between mb-5">
            <View>
              <Text className="text-[#0F172A] text-lg font-bold tracking-tight">Save to Playlist</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Organize your DSA cards</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="bg-slate-100 p-2 rounded-full"
            >
              <X color="#64748B" size={16} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {membershipLoading ? (
            <View className="py-8 justify-center items-center">
              <ActivityIndicator color="#8B5CF6" size="small" />
              <Text className="text-slate-400 text-xs mt-2">Loading playlists...</Text>
            </View>
          ) : isGuest ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }} className="mb-5">
              <Lock color="#64748B" size={32} strokeWidth={1.5} style={{ opacity: 0.8 }} />
              <Text className="text-[#0F172A] font-bold text-sm text-center mt-3 mb-1">
                Custom Playlists Locked
              </Text>
              <Text className="text-slate-400 text-xs text-center px-4 mb-5 leading-normal">
                Sign in with an account to create custom playlists and sync your revision progress across devices.
              </Text>
              <TouchableOpacity
                onPress={handleLogout}
                className="py-3 px-6 bg-[#8B5CF6] rounded-xl active:scale-95 shadow-sm"
              >
                <Text className="text-white text-xs font-semibold">Sign In / Register</Text>
              </TouchableOpacity>
            </View>
          ) : playlists.filter((p) => p.id !== 'likes' && p.id !== 'watch-later' && p.id !== 'easy' && p.id !== 'medium' && p.id !== 'hard' && p.id !== 'skipped').length === 0 ? (
            <View className="flex-1 mb-5">
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ListMusic color="#8B5CF6" size={32} strokeWidth={1.5} style={{ opacity: 0.8 }} />
                <Text className="text-[#0F172A] font-bold text-sm text-center mt-3 mb-1">
                  No Playlists Yet
                </Text>
                <Text className="text-slate-400 text-xs text-center px-4 mb-5 leading-normal">
                  Create your first revision playlist below to start organizing your cards.
                </Text>
              </View>
              
              {/* Premium Inline Playlist Creation Form */}
              <View className="p-4 rounded-2xl bg-slate-50 border border-slate-200/50">
                <Text className="text-slate-500 font-semibold text-[10px] uppercase tracking-wider mb-2">
                  Quick Create Playlist
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={newPlaylistName}
                    onChangeText={setNewPlaylistName}
                    placeholder="e.g. Graph prep, Amazon prep"
                    placeholderTextColor="#94A3B8"
                    style={{ height: 38 }}
                    className="flex-1 bg-white border border-slate-200 text-[#0F172A] px-3.5 rounded-xl text-xs"
                    editable={!isCreatingPlaylistInline}
                  />
                  <TouchableOpacity
                    onPress={handleCreatePlaylistInline}
                    disabled={isCreatingPlaylistInline || !newPlaylistName.trim()}
                    className="px-4 bg-[#8B5CF6] rounded-xl justify-center items-center disabled:opacity-50 active:scale-95"
                  >
                    {isCreatingPlaylistInline ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text className="text-white font-semibold text-xs">Create</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <View className="flex-1 mb-5">
              <ScrollView showsVerticalScrollIndicator={false} className="flex-1 mb-4 max-h-[220px]">
                {playlists
                  .filter((p) => p.id !== 'likes' && p.id !== 'watch-later' && p.id !== 'easy' && p.id !== 'medium' && p.id !== 'hard' && p.id !== 'skipped')
                  .map((playlist) => {
                    const isSelected = !!tempMembership[playlist.id];
                    return (
                      <TouchableOpacity
                        key={playlist.id}
                        onPress={() => {
                          lightHaptic();
                          setTempMembership(prev => ({
                            ...prev,
                            [playlist.id]: !isSelected
                          }));
                        }}
                        className={`flex-row items-center justify-between p-3.5 mb-2 rounded-xl border ${
                          isSelected ? 'bg-violet-50/50 border-violet-200/60' : 'bg-[#F8FAFC]/80 border-slate-100/50'
                        } active:opacity-85`}
                      >
                        <View className="flex-row items-center gap-3">
                          <ListMusic color={isSelected ? '#8B5CF6' : '#64748B'} size={18} />
                          <Text className={`font-semibold text-xs ${isSelected ? 'text-[#0F172A]' : 'text-slate-700'}`}>
                            {playlist.name}
                          </Text>
                        </View>
                        <View
                          className={`w-4 h-4 rounded-full border items-center justify-center ${
                            isSelected ? 'bg-violet-500 border-violet-500' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <Check color="#fff" size={9} strokeWidth={3} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>

              {/* Premium Inline Playlist Creation Form at list bottom */}
              <View className="pt-3 border-t border-slate-100 flex-row gap-2 items-center">
                <TextInput
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  placeholder="+ Create new playlist..."
                  placeholderTextColor="#94A3B8"
                  style={{ height: 38 }}
                  className="flex-1 bg-slate-50 border border-slate-200/60 text-[#0F172A] px-3.5 rounded-xl text-xs"
                  editable={!isCreatingPlaylistInline}
                />
                <TouchableOpacity
                  onPress={handleCreatePlaylistInline}
                  disabled={isCreatingPlaylistInline || !newPlaylistName.trim()}
                  className="px-4 py-2.5 bg-[#8B5CF6] rounded-xl justify-center items-center disabled:opacity-50 active:scale-95"
                >
                  {isCreatingPlaylistInline ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-semibold text-xs">Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View className="flex-row gap-2.5 mt-auto">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-3 rounded-xl items-center border border-slate-200 bg-white active:scale-95"
            >
              <Text className="text-slate-600 font-semibold text-xs">Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmitPlaylists}
              disabled={isPlaylistSubmitting || isGuest}
              className="flex-[1.5] py-3 rounded-xl items-center bg-[#8B5CF6] active:scale-95 disabled:opacity-50"
            >
              {isPlaylistSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-xs">Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the visibility card changes (i.e. opening/closing or switching cards)
  return prevProps.card?._id === nextProps.card?._id;
});

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  modalContent: {
    width: width - 32,
    maxHeight: height * 0.7,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(241, 245, 249, 0.8)',
    padding: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 12,
  },
});
