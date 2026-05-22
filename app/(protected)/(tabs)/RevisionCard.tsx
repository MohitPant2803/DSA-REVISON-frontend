import React, { useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, Alert, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { Tag, Code, BookOpen, Heart, BrainCircuit, Edit, Trash2, Archive, ListMusic, MoreVertical, X, Check } from 'lucide-react-native';
import Toast from 'react-native-toast-message';

import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAuthStore } from '@/store/useAuthStore';
import { useUpdateCardProgress, useUpdatePlaylistMembership } from '@/services/useProgress';
import { canModifyItem, UserRole } from '@/utils/permissions';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useCardPlaylistMembership } from '@/hooks/usePlaylistMembership';
import { useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { useRole } from '@/hooks/useRole';

// Inlined Atom One Dark theme to fix Metro bundler path resolution bugs
const atomOneDark = {
  'hljs': {
    color: '#abb2bf',
    backgroundColor: '#1e1e1e',
  },
  'hljs-comment': {
    color: '#5c6370',
    fontStyle: 'italic',
  },
  'hljs-quote': {
    color: '#5c6370',
    fontStyle: 'italic',
  },
  'hljs-keyword': {
    color: '#c678dd',
  },
  'hljs-selector-tag': {
    color: '#c678dd',
  },
  'hljs-literal': {
    color: '#56b6c2',
  },
  'hljs-number': {
    color: '#d19a66',
  },
  'hljs-regexp': {
    color: '#56b6c2',
  },
  'hljs-string': {
    color: '#98c379',
  },
  'hljs-title': {
    color: '#61afef',
  },
  'hljs-name': {
    color: '#e06c75',
  },
  'hljs-built_in': {
    color: '#e6c07b',
  },
  'hljs-bullet': {
    color: '#61afef',
  },
  'hljs-params': {
    color: '#abb2bf',
  },
};

// Styled components polyfill for NativeWind v4 compatibility
const styled = (Component: any) => Component;
const StyledView = styled(View);
const StyledText = styled(Text);
const StyledImage = styled(Image);
const StyledScrollView = styled(ScrollView);
const StyledTouchableOpacity = styled(TouchableOpacity);
const AnimatedView = styled(Animated.View);

export const CodeText = (props: any) => <StyledText {...props} />;

interface RevisionCardProps {
  slide: {
    card: IPopulatedRevisionCard;
    slideIndex: number;
    totalSlides: number;
    type?: string;
    headline: string;
    body?: string;
    code?: string;
    blocks?: any[];
  };
  currentIndex: number;
  totalCount: number;
  onContinuePress?: () => void;
}

interface ActionButtonProps {
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
}

const ActionButton = ({ onPress, icon, label, isActive }: ActionButtonProps) => (
  <StyledTouchableOpacity onPress={onPress} className="items-center gap-1.5">
    <StyledView className={`p-3 rounded-full ${isActive ? 'bg-blue-500' : 'bg-zinc-700/60'}`}>
      {icon}
    </StyledView>
    <StyledText className="text-zinc-400 text-xs font-bold">{label}</StyledText>
  </StyledTouchableOpacity>
);

const DifficultyBadge = ({ difficulty }: { difficulty: IPopulatedRevisionCard['difficulty'] | string }) => {
  const color =
    difficulty === 'Easy'
      ? 'bg-green-500/20 text-green-400'
      : difficulty === 'Medium'
      ? 'bg-yellow-500/20 text-yellow-400'
      : 'bg-red-500/20 text-red-400';

  return (
    <StyledView className={`px-4 py-1.5 rounded-full ${color.split(' ')[0]}`}>
      <StyledText className={`font-bold text-sm ${color.split(' ')[1]}`}>{difficulty}</StyledText>
    </StyledView>
  );
};

const TopicBadge = ({ topic }: { topic: string }) => {
  return (
    <StyledView className="flex-row items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20">
      <Tag color="#60a5fa" size={16} />
      <StyledText className="font-bold text-sm text-blue-400">{topic}</StyledText>
    </StyledView>
  );
};

export const RevisionCard = ({ slide, currentIndex, totalCount, onContinuePress }: RevisionCardProps) => {
  const { card } = slide;
  const router = useRouter();
  const { mutate: updateProgress } = useUpdateCardProgress();
  const { mutate: updatePlaylistMembership } = useUpdatePlaylistMembership();
  const { mutate: deleteCard } = useDeleteRevisionCard();
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const { data: playlists = [] } = usePlaylists();
  const { data: membership = {} } = useCardPlaylistMembership(card._id, showPlaylistPicker);

  const { user } = useAuthStore();
  const { role } = useRole();

  const folderId =
    typeof card.folderId === 'object' ? card.folderId._id : card.folderId;

  // Superadmin bypass for global CRUD
  const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
  const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role, user.id, card.createdBy) : false);

  console.log(`[RevisionCard] Permission Check: ${card.title} | canEdit: ${canEdit} | Role: ${role}`);

  const handleProgressUpdate = (action: 'favorite' | 'difficult' | 'archived') => {
    const key =
      action === 'favorite' ? 'isFavorite' : action === 'difficult' ? 'isDifficult' : 'isArchived';
    const currentValue = !!card[key];
    updateProgress({ cardId: card._id, action, value: !currentValue });
    if (action === 'favorite') {
      Toast.show({
        type: 'success',
        text1: currentValue ? 'Removed from Favorites' : 'Added to Favorites',
        position: 'top',
        visibilityTime: 1500,
      });
    }
  };

  const handleDelete = () => {
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
    router.push({
      pathname: '/(protected)/(tabs)/CreateRevisionScreen',
      params: { cardId: card._id, folderId },
    });
  };

  return (
    <StyledView className="flex-1 bg-[#0c0c0e]">
      <StyledView className="absolute top-12 left-0 right-0 px-5 flex-row gap-1 z-10">
        {Array.from({ length: Math.min(totalCount, 12) }).map((_, i) => {
          const segment = Math.floor((currentIndex / Math.max(totalCount - 1, 1)) * 11);
          return (
            <StyledView
              key={i}
              className={`flex-1 h-0.5 rounded-full ${i <= segment ? 'bg-violet-400/90' : 'bg-zinc-700/50'}`}
            />
          );
        })}
      </StyledView>

      <StyledView className="flex-1 pt-20 pb-28">
        <StyledScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}>
          <AnimatedView entering={FadeInDown.duration(400)} className="gap-y-6">
            <StyledView className="flex-row flex-wrap gap-2 items-center">
              <TopicBadge topic={card.topic} />
              <DifficultyBadge difficulty={card.difficulty} />
              {card.complexity && (
                <StyledView className="px-3 py-1 rounded-full bg-zinc-800/80">
                  <StyledText className="text-zinc-400 text-xs font-mono">{card.complexity}</StyledText>
                </StyledView>
              )}
            </StyledView>

            <StyledText className="text-zinc-50 text-[32px] font-bold tracking-tight leading-tight">
              {card.title}
            </StyledText>

            {card.tags?.length > 0 && (
              <StyledView className="flex-row flex-wrap gap-2">
                {card.tags.map((t) => (
                  <StyledView key={t} className="px-2.5 py-1 bg-zinc-800/60 rounded-md">
                    <StyledText className="text-zinc-500 text-xs">{t}</StyledText>
                  </StyledView>
                ))}
              </StyledView>
            )}

            {/* Optional Image */}
            {card.image && (
              <StyledImage
                source={{ uri: card.image }}
                className="w-full h-56 rounded-2xl bg-zinc-800"
                resizeMode="cover"
              />
            )}

            {/* Explanation */}
            <StyledView className="gap-3">
              <StyledView className="flex-row items-center gap-3">
                <BookOpen color="#a1a1aa" size={20} />
                <StyledText className="text-zinc-400 text-xl font-bold">Explanation</StyledText>
              </StyledView>
              <StyledText className="text-zinc-400 text-[17px] leading-7">{card.explanation}</StyledText>
            </StyledView>

            {card.examples?.length > 0 && (
              <StyledView className="gap-2">
                <StyledText className="text-zinc-500 text-sm font-semibold uppercase tracking-wider">
                  Examples
                </StyledText>
                {card.examples.map((ex, i) => (
                  <StyledView key={i} className="bg-zinc-900/80 rounded-2xl p-4 border border-zinc-800">
                    <StyledText className="text-zinc-400 text-base leading-relaxed">{ex}</StyledText>
                  </StyledView>
                ))}
              </StyledView>
            )}

            {/* Optional Code Block */}
            {card.code && (
              <StyledView className="gap-3">
                <StyledView className="flex-row items-center gap-3">
                  <Code color="#a1a1aa" size={20} />
                  <StyledText className="text-zinc-400 text-xl font-bold">Code</StyledText>
                </StyledView>
                <SyntaxHighlighter
                  language="javascript"
                  style={atomOneDark}
                  customStyle={{ borderRadius: 16, padding: 16, fontSize: 14 }}
                  // @ts-ignore
                  CodeTag={CodeText} // Use our custom Text component for code
                  // @ts-ignore
                  PreTag={Platform.OS === 'web' ? 'pre' : View} // Use View for PreTag on native
                >
                  {card.code}
                </SyntaxHighlighter>
              </StyledView>
            )}
          </AnimatedView>
        </StyledScrollView>
      </StyledView>

      {/* --- Quick Actions Sidebar --- */}
      <AnimatedView entering={FadeInDown.duration(600).delay(200)} className="absolute right-3 bottom-28 flex-col items-center gap-y-6">
        <TouchableOpacity onPress={() => handleProgressUpdate('favorite')} className="items-center">
          <View className="bg-slate-100/90 p-3 rounded-full border border-slate-200 shadow-sm">
            <Heart color={card.isFavorite ? "#ef4444" : "#64748B"} fill={card.isFavorite ? "#ef4444" : "transparent"} size={22} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowPlaylistPicker(true)} className="items-center">
          <View className="bg-slate-100/90 p-3 rounded-full border border-slate-200 shadow-sm">
            <ListMusic color="#64748B" size={22} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => {/* Show More Menu */}} className="items-center">
          <View className="bg-slate-100/90 p-3 rounded-full border border-slate-200 shadow-sm">
            <MoreVertical color="#64748B" size={22} />
          </View>
        </TouchableOpacity>
      </AnimatedView>

      {/* Playlist picker Modal */}
      <Modal visible={showPlaylistPicker} transparent animationType="fade">
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setShowPlaylistPicker(false)} 
          className="flex-1 bg-[#0F172A]/40 justify-end p-4"
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <StyledView
              className="w-full rounded-[24px] p-5 border border-slate-100"
              style={{ backgroundColor: 'rgba(255,255,255,0.98)' }}
            >
              <StyledView className="flex-row items-center justify-between mb-4">
                <StyledText className="text-[#0F172A] text-[17px] font-normal">Add to playlist</StyledText>
                <StyledTouchableOpacity onPress={() => setShowPlaylistPicker(false)} className="ml-auto">
                  <X color="#94A3B8" size={18} strokeWidth={2} />
                </StyledTouchableOpacity>
              </StyledView>

              <StyledScrollView className="max-h-[250px] mb-3" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {playlists.map((playlist) => {
                  const isAdded = !!membership[playlist.id];
                  return (
                    <StyledTouchableOpacity
                      key={playlist.id}
                      onPress={() => {
                        updatePlaylistMembership({
                          cardId: card._id,
                          addToPlaylist: isAdded ? undefined : playlist.id,
                          removeFromPlaylist: isAdded ? playlist.id : undefined
                        });
                      }}
                      className="flex-row items-center justify-between py-3 border-b border-slate-100 last:border-b-0"
                    >
                      <StyledView className="flex-row items-center gap-3">
                        <StyledView
                          className="w-8 h-8 rounded-full items-center justify-center"
                          style={{ backgroundColor: `${playlist.color1}20` }}
                        >
                          <ListMusic size={16} color={playlist.color1} />
                        </StyledView>
                        <StyledView>
                          <StyledText className="text-[#0F172A] font-medium">{playlist.name}</StyledText>
                          <StyledText className="text-zinc-500 text-xs">{playlist.itemCount} cards</StyledText>
                        </StyledView>
                      </StyledView>
                      {isAdded && (
                        <Animated.View entering={FadeInDown.duration(200).springify()}>
                          <Check color="#8B5CF6" size={20} strokeWidth={3} />
                        </Animated.View>
                      )}
                    </StyledTouchableOpacity>
                  );
                })}
              </StyledScrollView>
            </StyledView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </StyledView>
  );
};

export default RevisionCard;