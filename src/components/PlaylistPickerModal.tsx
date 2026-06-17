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
import { X, ListMusic, Check, Lock } from 'lucide-react-native';
import { usePlaylists, useCreatePlaylist, useTogglePlaylistItem } from '@/hooks/usePlaylists';
import { useCardPlaylistMembership } from '@/hooks/usePlaylistMembership';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';
import Toast from 'react-native-toast-message';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { useQueryClient } from '@tanstack/react-query';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha, ThemePalette } from '@/theme/themePalettes';

const { width } = Dimensions.get('window');

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

const getCustomTheme = (playlistName: string, palette: ThemePalette) => {
  const tones = [
    { bg: addAlpha(palette.accent, 0.08), border: addAlpha(palette.accent, 0.15), text: palette.accent, iconBg: addAlpha(palette.accent, 0.12) },
    { bg: addAlpha(palette.success, 0.08), border: addAlpha(palette.success, 0.15), text: palette.success, iconBg: addAlpha(palette.success, 0.12) },
    { bg: addAlpha(palette.info, 0.08), border: addAlpha(palette.info, 0.15), text: palette.info, iconBg: addAlpha(palette.info, 0.12) },
    { bg: addAlpha(palette.warning, 0.08), border: addAlpha(palette.warning, 0.15), text: palette.warning, iconBg: addAlpha(palette.warning, 0.12) },
  ];

  const hash = (playlistName || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
  return tones[hash % tones.length];
};

const CreatePlaylistOverlay = ({ onClose, onPlaylistCreated }: CreatePlaylistOverlayProps) => {
  const [playlistName, setPlaylistName] = useState('');
  const createPlaylistMutation = useCreatePlaylist();
  const palette = useThemePalette();

  const handleCreate = async () => {
    const trimmed = playlistName.trim();
    if (!trimmed) {
      Toast.show({ type: 'error', text1: 'Playlist name is required' });
      return;
    }
    try {
      lightHaptic();
      const newPlaylist = await createPlaylistMutation.mutateAsync(trimmed);
      if (newPlaylist && newPlaylist._id) {
        onPlaylistCreated(newPlaylist._id, trimmed);
        Toast.show({ type: 'success', text1: `Created playlist "${trimmed}"` });
      }
    } catch (err: any) {
      console.error('[Playlist Create Error]', err);
      Toast.show({
        type: 'error',
        text1: 'Could not create playlist',
        text2: err.message || 'Please try again',
      });
    }
  };

  const buttonTextColor = palette.isDark ? palette.textPrimary : palette.surface;

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.modalBackdrop, { backgroundColor: palette.overlayBg }]} onPress={onClose}>
        <View 
          style={[
            styles.createModalContent,
            {
              backgroundColor: palette.dialogBg,
              borderColor: palette.border,
              shadowColor: palette.shadow,
              shadowOpacity: palette.isDark ? 0.20 : 0.08,
              shadowRadius: palette.isDark ? 30 : 24,
            }
          ]} 
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => e.stopPropagation()}
        >
          <Text style={[styles.createModalTitle, { color: palette.textPrimary }]}>Create Custom Playlist</Text>

          <TextInput
            style={[
              styles.createModalInput,
              {
                borderColor: palette.border,
                color: palette.textPrimary,
                backgroundColor: palette.inputBg,
              }
            ]}
            placeholder="e.g. Dynamic Programming, Graph Core"
            placeholderTextColor={palette.textMuted}
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
              style={[
                styles.createModalCancelBtn,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                }
              ]}
            >
              <Text style={[styles.createModalCancelBtnText, { color: palette.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCreate}
              disabled={createPlaylistMutation.isPending}
              style={[
                styles.createModalSaveBtn,
                { backgroundColor: palette.accent, shadowColor: palette.accentGlow },
                createPlaylistMutation.isPending && { opacity: 0.7 }
              ]}
            >
              {createPlaylistMutation.isPending ? (
                <ActivityIndicator color={buttonTextColor} size="small" />
              ) : (
                <Text style={[styles.createModalSaveBtnText, { color: buttonTextColor }]}>Create</Text>
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
  const palette = useThemePalette();
  const displayCount = usePlaylistStateStore(
    React.useCallback((s) => {
      const order = s.playlistCardOrderMap[playlist.id];
      return order === undefined ? (playlist.itemCount ?? 0) : order.length;
    }, [playlist.id, playlist.itemCount])
  );
  const colors = getCustomTheme(playlist.name, palette);
  const checkColor = palette.isDark ? palette.textPrimary : palette.surface;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.gridCard,
        {
          backgroundColor: palette.surface,
          borderColor: isSelected ? palette.accent : colors.border,
        },
        isSelected && { backgroundColor: addAlpha(palette.accent, 0.02) }
      ]}
      activeOpacity={0.7}
    >
      <View 
        style={[
          styles.cardIconWrapper, 
          { backgroundColor: colors.iconBg, borderColor: colors.border }
        ]}
      >
        <ListMusic color={colors.text} size={13} strokeWidth={2.5} />
      </View>

      {isSelected && (
        <View style={[styles.cardCheckBadge, { backgroundColor: palette.accent, shadowColor: palette.accentGlow }]}>
          <Check color={checkColor} size={9} strokeWidth={3.5} />
        </View>
      )}

      <View style={{ marginTop: 8 }}>
        <Text 
          numberOfLines={1} 
          style={[styles.playlistName, { color: palette.textPrimary }]}
        >
          {playlist.name}
        </Text>
        <Text 
          style={[
            styles.playlistCount,
            { color: isSelected ? palette.accent : palette.textMuted }
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
  const palette = useThemePalette();

  const { step: walkthroughStep, setStep: setWalkthroughStep } = useWalkthroughStore();
  const isWalkthroughActive = walkthroughStep !== 'none';
  const showLock = isGuest && !isWalkthroughActive;

  const { data: playlists = [] } = usePlaylists();
  const togglePlaylistItem = useTogglePlaylistItem();

  const [tempMembership, setTempMembership] = useState<Record<string, boolean>>({});
  const [isPlaylistSubmitting, setIsPlaylistSubmitting] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const cleanCardId = card ? card._id.split('-loop-')[0] : '';
  const { data: membership, isPending: membershipLoading } = useCardPlaylistMembership(
    cleanCardId,
    !!card
  );

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
          promises.push(
            togglePlaylistItem.mutateAsync({
              playlistId: playlist.id,
              revisionCardId: cleanCardId,
              isInPlaylist: wasAdded,
            })
          );
        }
      }

      onClose();

      if (promises.length > 0) {
        Promise.all(promises).catch((err) => {
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

  const customPlaylists = playlists.filter(
    (p) => p.id !== 'likes' && p.id !== 'watch-later' && p.id !== 'easy' && p.id !== 'medium' && p.id !== 'hard' && p.id !== 'skipped'
  );

  const saveBtnTextColor = palette.isDark ? palette.textPrimary : palette.surface;

  return (
    <Modal
      visible={!!card}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <TouchableOpacity 
          style={{ ...StyleSheet.absoluteFillObject, backgroundColor: palette.overlayBg }}
          activeOpacity={1} 
          onPress={onClose} 
        />

        <View 
          style={[
            styles.modalContent,
            {
              backgroundColor: palette.dialogBg,
              borderColor: palette.border,
              shadowColor: palette.shadow,
              shadowOpacity: palette.isDark ? 0.20 : 0.15,
              shadowRadius: palette.isDark ? 30 : 24,
            },
            showLock && { height: 210 }
          ]}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>Save to Playlist</Text>
              <Text style={[styles.headerSubtitle, { color: palette.textSecondary }]}>Organize your cards</Text>
            </View>
            <TouchableOpacity 
              onPress={onClose} 
              style={[styles.closeBtn, { backgroundColor: palette.inputBg }]}
            >
              <X color={palette.textSecondary} size={16} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {membershipLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={palette.accent} size="small" />
              <Text style={[styles.loadingText, { color: palette.textMuted }]}>Loading playlists...</Text>
            </View>
          ) : showLock ? (
            <View style={styles.guestContainer}>
              <Lock color={palette.textSecondary} size={32} strokeWidth={1.5} style={{ opacity: 0.8 }} />
              <Text style={[styles.guestTitle, { color: palette.textPrimary }]}>Custom Playlists Locked</Text>
              <Text style={[styles.guestSubtitle, { color: palette.textSecondary }]}>
                Sign in with an account to create custom playlists and sync your revision progress across devices.
              </Text>
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
                      <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>No Playlists Yet</Text>
                      <Text style={[styles.emptySubtitle, { color: palette.textMuted }]}>
                        Tap "+ New Playlist" below to create your first playlist and organize your revision decks.
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
                            if (isWalkthroughActive) {
                              // Force select the only stack during walkthrough
                              if (playlist.id !== 'guest-custom-playlist') return;
                            }
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

          {(!isGuest || isWalkthroughActive) && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={() => {
                  if (isWalkthroughActive) return;
                  lightHaptic();
                  setIsCreatingNew(true);
                }}
                disabled={isWalkthroughActive}
                style={[
                  styles.ctaNewBtn,
                  {
                    borderColor: palette.accent,
                    backgroundColor: palette.surface,
                  },
                  isWalkthroughActive && { opacity: 0.4 }
                ]}
              >
                <Text style={[styles.ctaNewBtnText, { color: palette.accent }]}>+ New Playlist</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={isWalkthroughActive ? () => {
                  lightHaptic();
                  onClose();
                  setWalkthroughStep('point-myspace');
                } : handleSubmitPlaylists}
                disabled={isPlaylistSubmitting}
                style={[
                  styles.saveBtn,
                  { backgroundColor: palette.accent },
                  isPlaylistSubmitting && { opacity: 0.5 }
                ]}
              >
                {isPlaylistSubmitting ? (
                  <ActivityIndicator color={saveBtnTextColor} size="small" />
                ) : (
                  <Text style={[styles.saveBtnText, { color: saveBtnTextColor }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {isCreatingNew && (
        <CreatePlaylistOverlay
          onClose={() => setIsCreatingNew(false)}
          onPlaylistCreated={(id) => {
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
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  modalContent: {
    width: width - 24,
    height: 350,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    elevation: 12,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 999,
  },
  loadingContainer: {
    paddingVertical: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    marginTop: 8,
  },
  guestContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 0,
  },
  guestTitle: {
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  guestSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 0,
    lineHeight: 18,
  },
  emptyContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
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
    width: (width - 24 - 40 - 8) / 2,
    height: 94,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
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
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  playlistName: {
    fontSize: 11,
    fontWeight: '800',
  },
  playlistCount: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  ctaNewBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaNewBtnText: {
    fontWeight: '800',
    fontSize: 13,
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    fontWeight: '800',
    fontSize: 13,
  },
  createModalContent: {
    width: width - 48,
    borderRadius: 32,
    borderWidth: 1,
    padding: 24,
    elevation: 10,
  },
  createModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  createModalInput: {
    borderWidth: 1,
    padding: 14,
    borderRadius: 16,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  createModalSaveBtnText: {
    fontWeight: '800',
    fontSize: 12,
  },
  createModalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createModalCancelBtnText: {
    fontWeight: '800',
    fontSize: 12,
  },
});
