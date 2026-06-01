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
  Pressable,
} from 'react-native';
import { X, ListMusic, Check, Lock, Plus } from 'lucide-react-native';
import { usePlaylists, useCreatePlaylist, useTogglePlaylistItem } from '@/hooks/usePlaylists';
import { useCardPlaylistMembership } from '@/hooks/usePlaylistMembership';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import Toast from 'react-native-toast-message';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { useQueryClient } from '@tanstack/react-query';

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

interface CreatePlaylistOverlayProps {
  onClose: () => void;
  onPlaylistCreated: (id: string, name: string) => void;
}

const getCustomTheme = (playlistName: string) => {
  const tones = [
    { bg: '#F5F3FF', border: 'rgba(109, 40, 217, 0.15)', text: '#6D28D9', bar: '#8B5CF6', iconBg: '#E8E3FF' }, // soft violet
    { bg: '#ECFDF5', border: 'rgba(16, 185, 129, 0.15)', text: '#047857', bar: '#10B981', iconBg: '#D1FAE5' }, // soft emerald
    { bg: '#EFF6FF', border: 'rgba(59, 130, 246, 0.15)', text: '#1D4ED8', bar: '#3B82F6', iconBg: '#DBEAFE' }, // soft blue
    { bg: '#FFF5F5', border: 'rgba(239, 68, 68, 0.15)', text: '#B91C1C', bar: '#EF4444', iconBg: '#FFE3E3' }, // soft rose
  ];

  const hash = (playlistName || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
  return tones[hash % tones.length];
};

const CreatePlaylistOverlay = ({ onClose, onPlaylistCreated }: CreatePlaylistOverlayProps) => {
  const [playlistName, setPlaylistName] = useState('');
  const createPlaylistMutation = useCreatePlaylist();

  const handleCreate = async () => {
    const trimmed = playlistName.trim();
    if (!trimmed) {
      Toast.show({ type: 'error', text1: 'Collection name is required' });
      return;
    }
    try {
      lightHaptic();
      const newPlaylist = await createPlaylistMutation.mutateAsync(trimmed);
      if (newPlaylist && newPlaylist._id) {
        onPlaylistCreated(newPlaylist._id, trimmed);
        Toast.show({ type: 'success', text1: `Created collection "${trimmed}"` });
      }
    } catch (err: any) {
      console.error('[Playlist Create Error]', err);
      Toast.show({
        type: 'error',
        text1: 'Could not create collection',
        text2: err.message || 'Please try again',
      });
    }
  };

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View 
          style={styles.createModalContent} 
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => e.stopPropagation()}
        >
          <Text style={styles.createModalTitle}>Create Custom Collection</Text>

          <TextInput
            style={styles.createModalInput}
            placeholder="e.g. Dynamic Programming, Graph Core"
            placeholderTextColor="#94A3B8"
            value={playlistName}
            onChangeText={setPlaylistName}
            autoFocus
            editable={!createPlaylistMutation.isPending}
            maxLength={25}
          />

          <View style={styles.createModalBtnRow}>
            <TouchableOpacity
              onPress={onClose}
              disabled={createPlaylistMutation.isPending}
              style={styles.createModalCancelBtn}
            >
              <Text style={styles.createModalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCreate}
              disabled={createPlaylistMutation.isPending}
              style={[styles.createModalSaveBtn, createPlaylistMutation.isPending && { opacity: 0.7 }]}
            >
              {createPlaylistMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.createModalSaveBtnText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

interface PlaylistPickerCardProps {
  playlist: any;
  isSelected: boolean;
  onPress: () => void;
}

const PlaylistPickerCard = React.memo(({ playlist, isSelected, onPress }: PlaylistPickerCardProps) => {
  const displayCount = usePlaylistStateStore(
    React.useCallback((s) => {
      const order = s.playlistCardOrderMap[playlist.id];
      return order === undefined ? (playlist.itemCount ?? 0) : order.length;
    }, [playlist.id, playlist.itemCount])
  );
  const colors = getCustomTheme(playlist.name);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.gridCard,
        { borderColor: isSelected ? '#8B5CF6' : colors.border },
        isSelected && { backgroundColor: 'rgba(139, 92, 246, 0.02)' }
      ]}
      activeOpacity={0.7}
    >
      {/* Beautiful Playlist Icon Square */}
      <View 
        style={[
          styles.cardIconWrapper, 
          { backgroundColor: colors.iconBg, borderColor: colors.border }
        ]}
      >
        <ListMusic color={colors.text} size={13} strokeWidth={2.5} />
      </View>

      {/* Top-right Check badge */}
      {isSelected && (
        <View style={styles.cardCheckBadge}>
          <Check color="#fff" size={9} strokeWidth={3.5} />
        </View>
      )}

      <View style={{ marginTop: 8 }}>
        <Text 
          numberOfLines={1} 
          style={styles.playlistName}
        >
          {playlist.name}
        </Text>
        <Text 
          style={[
            styles.playlistCount,
            { color: isSelected ? '#8B5CF6' : '#94A3B8' }
          ]}
        >
          {displayCount} {displayCount === 1 ? 'card' : 'cards'}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export const PlaylistPickerModal = ({ card, onClose }: PlaylistPickerModalProps) => {
  const { user } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  const queryClient = useQueryClient();

  const { data: playlists = [] } = usePlaylists();
  const togglePlaylistItem = useTogglePlaylistItem();

  // Local state for checking memberships and quick inputs
  const [tempMembership, setTempMembership] = useState<Record<string, boolean>>({});
  const [isPlaylistSubmitting, setIsPlaylistSubmitting] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const cleanCardId = card ? card._id.split('-loop-')[0] : '';
  // Fetch playlist memberships for the current card
  const { data: membership, isPending: membershipLoading } = useCardPlaylistMembership(
    cleanCardId,
    !!card
  );

  // Reset and sync tempMembership whenever the active card or its memberships change
  useEffect(() => {
    if (membership && card) {
      setTempMembership(membership);
    } else {
      setTempMembership({});
    }
  }, [membership, card]);

  const handleSubmitPlaylists = async () => {
    if (isGuest) return;
    if (!membership || !card) return;

    setIsPlaylistSubmitting(true);
    lightHaptic();

    const promises = [];

    try {
      for (const playlist of playlists) {
        if (['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].includes(playlist.id)) continue;
        const wasAdded = !!membership[playlist.id];
        const isAddedNow = !!tempMembership[playlist.id];

        if (wasAdded !== isAddedNow) {
          // Instantly update local Zustand store for synchronous real-time UI changes
          usePlaylistStateStore.getState().toggleCustomPlaylistItemInStore(playlist.id, cleanCardId, isAddedNow);

          promises.push(
            togglePlaylistItem.mutateAsync({
              playlistId: playlist.id,
              revisionCardId: cleanCardId,
              isInPlaylist: wasAdded,
            })
          );
        }
      }

      // Close the modal instantly so the transition is fluid, and let mutations resolve in parallel background
      onClose();

      if (promises.length > 0) {
        Promise.all(promises)
          .then(() => {
            // Background commits remain completely silent and invisible without heavy list refreshes
          })
          .catch((err) => {
            console.error('[Playlist Async Sync Error]', err);
            Toast.show({
              type: 'error',
              text1: 'Sync Failed',
              text2: err?.message || 'Some changes failed to sync.',
              position: 'top',
            });
          });
      }
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

  const customPlaylists = playlists.filter(
    (p) => p.id !== 'likes' && p.id !== 'watch-later' && p.id !== 'easy' && p.id !== 'medium' && p.id !== 'hard' && p.id !== 'skipped'
  );

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
          {/* Header row */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Save to Playlist</Text>
              <Text style={styles.headerSubtitle}>Organize your DSA cards</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X color="#64748B" size={16} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {membershipLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#8B5CF6" size="small" />
              <Text style={styles.loadingText}>Loading playlists...</Text>
            </View>
          ) : isGuest ? (
            <View style={styles.guestContainer}>
              <Lock color="#64748B" size={32} strokeWidth={1.5} style={{ opacity: 0.8 }} />
              <Text style={styles.guestTitle}>Custom Playlists Locked</Text>
              <Text style={styles.guestSubtitle}>
                Sign in with an account to create custom playlists and sync your revision progress across devices.
              </Text>
              <TouchableOpacity onPress={handleLogout} style={styles.guestBtn}>
                <Text style={styles.guestBtnText}>Sign In / Register</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1, marginVertical: 8 }}>
              <ScrollView 
                showsVerticalScrollIndicator={true} 
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                <View style={styles.gridContainer}>
                  {customPlaylists.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyTitle}>No Playlists Yet</Text>
                      <Text style={styles.emptySubtitle}>
                        Tap "+ New Playlist" below to create your first collection and organize your DSA revision decks.
                      </Text>
                    </View>
                  ) : (
                    customPlaylists.map((playlist) => {
                      const isSelected = !!tempMembership[playlist.id];
                      return (
                        <PlaylistPickerCard
                          key={playlist.id}
                          playlist={playlist}
                          isSelected={isSelected}
                          onPress={() => {
                            lightHaptic();
                            setTempMembership(prev => ({
                              ...prev,
                              [playlist.id]: !isSelected
                            }));
                          }}
                        />
                      );
                    })
                  )}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Dialog Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => {
                lightHaptic();
                setIsCreatingNew(true);
              }}
              style={styles.ctaNewBtn}
            >
              <Text style={styles.ctaNewBtnText}>+ New Playlist</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmitPlaylists}
              disabled={isPlaylistSubmitting || isGuest}
              style={[
                styles.saveBtn,
                (isPlaylistSubmitting || isGuest) && { opacity: 0.5 }
              ]}
            >
              {isPlaylistSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Structured Playlist Creation Overlay (same as myspace tab style, with native StyleSheet stability) */}
      {isCreatingNew && (
        <CreatePlaylistOverlay
          onClose={() => setIsCreatingNew(false)}
          onPlaylistCreated={(id, name) => {
            setTempMembership(prev => ({
              ...prev,
              [id]: true,
            }));
            setIsCreatingNew(false);
          }}
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  modalContent: {
    width: width - 24,
    height: 350, // Fixed premium height ensuring perfect fit, scrollability, and pinned buttons layout
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 20, // Tighter padding for smaller look
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 12,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12, // Tighter spacing
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    padding: 8,
    borderRadius: 999,
  },
  loadingContainer: {
    paddingVertical: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
  },
  guestContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  guestTitle: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  guestSubtitle: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
    lineHeight: 18,
  },
  guestBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
  },
  guestBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyTitle: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    width: (width - 24 - 40 - 8) / 2, // Perfect 2-column grid fit with wider container padding
    height: 94, // Premium vertical card height
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
    backgroundColor: '#ffffff',
    position: 'relative',
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cardCheckBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  playlistName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  playlistCount: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12, // Tighter spacing
  },
  ctaNewBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaNewBtnText: {
    color: '#8B5CF6',
    fontWeight: '800',
    fontSize: 13,
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  createModalContent: {
    width: width - 48,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  createModalTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  createModalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    color: '#0F172A',
    padding: 14,
    borderRadius: 16,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: '#F8FAFC',
    marginBottom: 20,
  },
  createModalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  createModalSaveBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  createModalSaveBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  createModalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createModalCancelBtnText: {
    color: '#64748B',
    fontWeight: '800',
    fontSize: 12,
  },
});
