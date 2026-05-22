import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Vibration,
  Platform,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  X,
  ListMusic,
  Check,
  Heart,
  MoreVertical,
  Clock,
  ChevronRight,
} from 'lucide-react-native';
import { IPopulatedRevisionCard, ISlide } from '@/hooks/useRevisionCards';
import { usePlaylists, useTogglePlaylistItem } from '@/hooks/usePlaylists';
import { useCardPlaylistMembership } from '@/hooks/usePlaylistMembership';
import { useUpdateCardProgress } from '@/services/useProgress';
import { useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { useAuthStore } from '@/store/useAuthStore';
import { useRole } from '@/hooks/useRole';
import { canModifyItem, UserRole } from '@/utils/permissions';
import * as userCardStateService from '@/services/userCardStateService';
import Toast from 'react-native-toast-message';

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(12);
  } else {
    Vibration.vibrate(8);
  }
};

export const getSlidesForCard = (card: IPopulatedRevisionCard): ISlide[] => {
  if (card.slides && card.slides.length > 0) {
    return card.slides;
  }
  const slides: ISlide[] = [];
  
  slides.push({
    type: 'intro',
    headline: card.title,
    body: card.explanation,
  });

  if (card.code && card.code.trim()) {
    slides.push({
      type: 'code',
      headline: 'Code Walkthrough',
      body: 'Review the complete algorithmic implementation below:',
      code: card.code,
    });
  } else if (card.examples && card.examples.length > 0) {
    slides.push({
      type: 'dryrun',
      headline: 'Examples & Cases',
      body: `Let's dry run the algorithm with some sample test cases:`,
    });
  }

  slides.push({
    type: 'summary',
    headline: 'Concept Summary',
    body: card.complexity 
      ? `Successfully mastered this concept! Time Complexity is estimated at ${card.complexity}.`
      : 'Successfully mastered this concept! Retain this core pattern for coding interviews.',
  });

  return slides;
};

interface ConceptCardPreviewProps {
  card: IPopulatedRevisionCard;
  onViewExplanation: (index?: number) => void;
  isWatchLater: boolean;
  onToggleWatchLater: () => void;
  onCardStateUpdate?: (cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => void;
  activePlaylistId?: string | null;
}

export const ConceptCardPreview = React.memo(({ card, onViewExplanation, isWatchLater, onToggleWatchLater, onCardStateUpdate, activePlaylistId }: ConceptCardPreviewProps) => {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { role } = useRole();
  const { mutate: updateProgress } = useUpdateCardProgress();
  const { mutate: deleteCard } = useDeleteRevisionCard();

  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const { data: playlists = [] } = usePlaylists();
  const { data: membership, isPending: membershipLoading } = useCardPlaylistMembership(card._id, showPlaylistPicker);
  const togglePlaylistItem = useTogglePlaylistItem();

  const [tempMembership, setTempMembership] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (membership && showPlaylistPicker) {
      setTempMembership(membership);
    }
  }, [membership, showPlaylistPicker]);

  const isAnySelected = useMemo(() => {
    return Object.values(tempMembership).some(v => v);
  }, [tempMembership]);

  const folderId = typeof card.folderId === 'object' ? card.folderId._id : card.folderId;
  const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
  const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role as UserRole, user.id, card.createdBy) : false);

  const slidesList = getSlidesForCard(card);
  const slideCount = slidesList.length;

  const isGuest = user?.id === 'guest-user';

  const promptSignIn = () => {
    Alert.alert(
      "Sign In Required",
      "Please sign in to save progress, favorite cards, or manage playlists.",
      [
        { text: "Maybe Later", style: "cancel" },
        { 
          text: "Sign In", 
          onPress: async () => {
            await logout();
          } 
        }
      ]
    );
  };

  const handleProgressUpdate = (action: 'favorite' | 'difficult' | 'archived') => {
    if (isGuest) return promptSignIn();

    const cleanId = card._id.split('-loop-')[0];

    if (action === 'favorite') {
      const currentlyRed = !!card.isFavorite || (!!activePlaylistId && activePlaylistId !== 'likes');
      const newValue = !currentlyRed;

      // 1. Optimistic parent update
      onCardStateUpdate?.(cleanId, 'favorite', newValue);

      // 2. Update favorite/like in progress
      updateProgress(
        { cardId: cleanId, action: 'favorite', value: newValue },
        {
          onError: (err) => {
            console.error(`[LIKE MUTATION ERROR]`, err);
            onCardStateUpdate?.(cleanId, 'favorite', currentlyRed);
          }
        }
      );

      // Call new backend userCardState toggle
      if (!isGuest) {
        userCardStateService.toggleLike(cleanId).catch((err) => {
          console.error('[UserCardState toggleLike Error]', err);
        });
      }

      // 3. Remove/add from current playlist too
      if (activePlaylistId && activePlaylistId !== 'likes' && activePlaylistId !== 'watch-later') {
        togglePlaylistItem.mutate(
          {
            playlistId: activePlaylistId,
            revisionCardId: cleanId,
            isInPlaylist: currentlyRed, // if it was red, remove it (isInPlaylist = true)
          },
          {
            onError: (err) => {
              console.error(`[PLAYLIST TOGGLE ERROR]`, err);
            }
          }
        );
      }

      Toast.show({
        type: 'success',
        text1: currentlyRed ? 'Removed from Likes & Playlist' : 'Marked as Favorite',
        position: 'top',
        visibilityTime: 1500,
      });
      return;
    }

    const key = action === 'difficult' ? 'isDifficult' : 'isArchived';
    const currentValue = !!card[key];
    const newValue = !currentValue;

    // Optimistic parent update
    onCardStateUpdate?.(cleanId, action, newValue);

    updateProgress(
      { cardId: cleanId, action, value: newValue },
      {
        onError: (err) => {
          console.error(`[MUTATION ERROR]`, err);
          onCardStateUpdate?.(cleanId, action, currentValue);
        }
      }
    );
    
    Toast.show({
      type: 'success',
      text1: currentValue ? `Removed from ${action}` : `Marked as ${action}`,
      position: 'top',
      visibilityTime: 1500,
    });
  };

  const handleDelete = () => {
    if (isGuest) return promptSignIn();

    Alert.alert('Delete Card', 'Are you sure you want to permanently delete this card?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteCard(card._id),
      },
    ]);
  };

  const handleEdit = () => {
    if (isGuest) return promptSignIn();

    router.push({
      pathname: '/(protected)/(tabs)/CreateRevisionScreen',
      params: { cardId: card._id, folderId, card: JSON.stringify(card) },
    });
  };

  const handleSubmitPlaylists = async () => {
    if (isGuest) return promptSignIn();
    if (!membership) return;

    setIsSubmitting(true);
    lightHaptic();

    const cleanCardId = card._id.split('-loop-')[0];
    console.log(`[PLAYLIST SUBMIT] Starting submit for cardId: ${cleanCardId}`);
    console.log(`[PLAYLIST SUBMIT] Authenticated user exists:`, !!user);

    try {
      for (const playlist of playlists) {
        if (playlist.id === 'likes' || playlist.id === 'watch-later') continue;
        const wasAdded = !!membership[playlist.id];
        const isAddedNow = !!tempMembership[playlist.id];

        if (wasAdded !== isAddedNow) {
          console.log(`[PLAYLIST SUBMIT] Toggling playlistId: ${playlist.id}, wasAdded: ${wasAdded}, isAddedNow: ${isAddedNow}`);
          await togglePlaylistItem.mutateAsync({
            playlistId: playlist.id,
            revisionCardId: cleanCardId,
            isInPlaylist: wasAdded,
          });
          console.log(`[PLAYLIST SUBMIT SUCCESS] Toggled playlistId: ${playlist.id}`);
        }
      }

      Toast.show({
        type: 'success',
        text1: 'Playlists Saved',
        text2: 'Playlists membership updated successfully.',
        position: 'top',
        visibilityTime: 2000,
      });

      setShowPlaylistPicker(false);
    } catch (err: any) {
      console.error('[PLAYLIST SUBMIT OVERALL ERROR]', err);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err.message || 'Could not update playlist membership.',
        position: 'top',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const showCardOptionsMenu = () => {
    const options = [
      {
        text: 'Code Walkthrough',
        onPress: () => {
          const slides = getSlidesForCard(card);
          const idx = slides.findIndex((s) => s.type === 'code');
          onViewExplanation(idx !== -1 ? idx : 0);
        },
      },
      {
        text: 'Trace Dry Run',
        onPress: () => {
          const slides = getSlidesForCard(card);
          const idx = slides.findIndex((s) => s.type === 'dryrun');
          onViewExplanation(idx !== -1 ? idx : 0);
        },
      },
      {
        text: card.isArchived ? 'Unhide Card' : 'Hide Card (Archive)',
        onPress: () => handleProgressUpdate('archived'),
      },
    ];

    if (canEdit) {
      options.push({ text: 'Edit Card', onPress: handleEdit });
      options.push({ text: 'Delete Card', onPress: handleDelete });
    }

    Alert.alert(card.title, 'Choose an action for this card:', [
      ...options.map((opt) => ({ text: opt.text, onPress: opt.onPress })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View className="flex-1 justify-between bg-transparent h-full pb-2 relative">
      <Text className="text-[#94A3B8] text-[13px] mb-4">
        {card.topic} · {card.difficulty}
        {card.complexity ? ` · ${card.complexity}` : ''}
      </Text>

      <Text
        className="text-[#0F172A] font-normal tracking-tight leading-tight mb-5 text-[28px]"
        numberOfLines={3}
      >
        {card.title}
      </Text>

      <View className="flex-1 justify-start mb-8">
        <Text className="text-[#64748B] text-[15px] leading-relaxed" numberOfLines={6}>
          {card.explanation}
        </Text>
        <Text className="text-[#94A3B8] text-[13px] mt-4">{slideCount} slides</Text>
      </View>

      <View className="mt-auto w-full">
        <TouchableOpacity
          onPress={() => onViewExplanation()}
          activeOpacity={0.92}
          className="py-4 rounded-[22px] flex-row items-center justify-center gap-1 bg-[#8B5CF6] shadow-md shadow-violet-500/20 active:scale-[0.98]"
          style={{
            shadowColor: '#8B5CF6',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 2,
            width: '82%',
          }}
        >
          <Text className="text-white text-[15px] font-medium tracking-tight">View explanation</Text>
          <ChevronRight color="#ffffff" size={16} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View className="absolute right-0 bottom-4 items-center gap-4 z-50">
        <TouchableOpacity onPress={() => handleProgressUpdate('favorite')} className="items-center active:scale-90">
          <View className="bg-white/95 p-3 rounded-full border border-slate-100/50 shadow-md">
            <Heart 
              color={
                (!!card.isFavorite || (!!activePlaylistId && activePlaylistId !== 'likes')) 
                  ? "#ef4444" 
                  : "#64748B"
              } 
              fill={
                (!!card.isFavorite || (!!activePlaylistId && activePlaylistId !== 'likes')) 
                  ? "#ef4444" 
                  : "transparent"
              } 
              size={20} 
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={onToggleWatchLater} className="items-center active:scale-90">
          <View className="bg-white/95 p-3 rounded-full border border-slate-100/50 shadow-md">
            <Clock color={isWatchLater ? "#3b82f6" : "#64748B"} size={20} strokeWidth={2.25} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { lightHaptic(); setShowPlaylistPicker(true); }} className="items-center active:scale-90">
          <View className="bg-white/95 p-3 rounded-full border border-slate-100/50 shadow-md">
            <ListMusic color="#64748B" size={20} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={showCardOptionsMenu} className="items-center active:scale-90">
          <View className="bg-white/95 p-3 rounded-full border border-slate-100/50 shadow-md">
            <MoreVertical color="#64748B" size={20} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Playlist Picker */}
      <Modal visible={showPlaylistPicker} transparent animationType="fade">
        <View className="flex-1 bg-[#0F172A]/40 justify-end p-4">
          <View
            className="w-full rounded-[28px] p-6 border border-slate-100 shadow-2xl"
            style={{ backgroundColor: 'rgba(255,255,255,0.98)' }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[#0F172A] text-[17px] font-bold tracking-tight">Add to playlist</Text>
              {membershipLoading && <ActivityIndicator size="small" color="#8B5CF6" />}
              <TouchableOpacity onPress={() => setShowPlaylistPicker(false)} className="p-1 ml-auto bg-slate-100 rounded-full">
                <X color="#94A3B8" size={16} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-[250px] mb-3" showsVerticalScrollIndicator={false}>
              {playlists
                .filter((p) => p.id !== 'likes' && p.id !== 'watch-later')
                .map((playlist) => {
                  const isAdded = !!tempMembership[playlist.id];
                  const activeColor = playlist.color1 || '#8B5CF6';
                  return (
                    <TouchableOpacity
                      key={playlist.id}
                      activeOpacity={0.7}
                      onPress={() => {
                        lightHaptic();
                        setTempMembership((prev) => ({
                          ...prev,
                          [playlist.id]: !isAdded,
                        }));
                      }}
                      style={{
                        borderColor: isAdded ? activeColor : 'rgba(226, 232, 240, 0.8)',
                        backgroundColor: isAdded ? `${activeColor}0A` : '#F8FAFC',
                        borderWidth: 1.5,
                      }}
                      className="flex-row items-center justify-between p-4 mb-2.5 rounded-2xl active:opacity-90 transition-all duration-200"
                    >
                      <View className="flex-row items-center gap-3">
                        <ListMusic color={activeColor} size={18} strokeWidth={2.5} />
                        <Text className="text-[#0F172A] text-[14px] font-semibold tracking-tight">{playlist.name}</Text>
                      </View>
                      <View
                        style={{
                          borderColor: isAdded ? activeColor : '#E2E8F0',
                          backgroundColor: isAdded ? activeColor : 'transparent',
                          borderWidth: 1.5,
                        }}
                        className="w-5 h-5 rounded-full items-center justify-center"
                      >
                        {isAdded && <Check color="#fff" size={11} strokeWidth={3} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              {playlists.filter(p => p.id !== 'likes' && p.id !== 'watch-later').length === 0 && (
                <Text className="text-[#94A3B8] text-[14px] text-center py-4">
                  Create a playlist in My Space first.
                </Text>
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={handleSubmitPlaylists}
              disabled={playlists.filter(p => p.id !== 'likes' && p.id !== 'watch-later').length === 0 || isSubmitting}
              style={{
                backgroundColor: playlists.filter(p => p.id !== 'likes' && p.id !== 'watch-later').length > 0 ? '#8B5CF6' : '#CBD5E1',
                opacity: isSubmitting ? 0.8 : 1,
              }}
              className="w-full py-4 rounded-2xl items-center justify-center flex-row gap-2 active:scale-[0.99] shadow-md shadow-violet-500/10"
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white font-semibold text-[15px]">Save to Playlists</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.card._id === nextProps.card._id &&
    prevProps.card.isFavorite === nextProps.card.isFavorite &&
    prevProps.card.isDifficult === nextProps.card.isDifficult &&
    prevProps.card.isArchived === nextProps.card.isArchived &&
    prevProps.isWatchLater === nextProps.isWatchLater &&
    prevProps.activePlaylistId === nextProps.activePlaylistId
  );
});
