import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, Modal, ActivityIndicator, InteractionManager } from 'react-native';
import { Image } from 'expo-image';
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

  const [isCodeLoaded, setIsCodeLoaded] = useState(false);
  React.useEffect(() => {
    if (slide.type === 'code') {
      const task = InteractionManager.runAfterInteractions(() => {
        setIsCodeLoaded(true);
      });
      return () => task.cancel();
    }
  }, [slide.type]);

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
    <StyledView className="flex-1 bg-transparent pr-14">
      <StyledView className="flex-1 pt-2 pb-6">
        <StyledScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <AnimatedView entering={FadeInDown.duration(400)} className="gap-y-5">
            
            {/* Premium Apple-style Badge Row */}
            <StyledView className="flex-row flex-wrap gap-2 items-center">
              <StyledView className="px-3 py-1 rounded-full bg-violet-50 border border-violet-100/80">
                <StyledText className="text-violet-700 text-[10px] font-extrabold uppercase tracking-wider">{card.topic}</StyledText>
              </StyledView>
              <StyledView className={`px-3 py-1 rounded-full ${
                card.difficulty === 'Easy' ? 'bg-emerald-50 border border-emerald-100' :
                card.difficulty === 'Medium' ? 'bg-amber-50 border border-amber-100' :
                'bg-rose-50 border border-rose-100'
              }`}>
                <StyledText className={`text-[10px] font-extrabold uppercase tracking-wider ${
                  card.difficulty === 'Easy' ? 'text-emerald-700' :
                  card.difficulty === 'Medium' ? 'text-amber-700' :
                  'text-rose-700'
                }`}>{card.difficulty}</StyledText>
              </StyledView>
              {card.complexity && (
                <StyledView className="px-3 py-1 rounded-full bg-slate-50 border border-slate-200/60">
                  <StyledText className="text-slate-600 text-[10px] font-mono font-extrabold uppercase tracking-wider">{card.complexity}</StyledText>
                </StyledView>
              )}
            </StyledView>

            <StyledText className="text-slate-900 text-[28px] font-extrabold tracking-tighter leading-tight">
              {slide.headline}
            </StyledText>

            {/* 1. Intro / Cover & 2. Intuition / Explanation slide rendering */}
            {(slide.type === 'intro' || slide.type === 'explanation' || slide.type === 'intuition') && (
              <StyledView className="gap-y-4">
                <StyledText className="text-slate-600 text-[15px] leading-relaxed">
                  {slide.body || card.explanation}
                </StyledText>
                
                {/* Premium Takeaways violet outline summary box */}
                <StyledView className="bg-violet-50/40 rounded-2xl p-5 border border-violet-200/50 gap-4 mt-2">
                  <StyledView className="flex-row items-center gap-2">
                    <StyledView className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                    <StyledText className="text-violet-800 text-[14px] font-black tracking-tight uppercase">
                      Core Intuition
                    </StyledText>
                  </StyledView>
                  <StyledText className="text-slate-600 text-[13px] leading-relaxed">
                    Identify the base boundaries of the problem. Caching states or iterating progressively allows building towards the optimal solution.
                  </StyledText>
                </StyledView>
              </StyledView>
            )}

            {/* Optional Cover Image */}
            {card.image && slide.type === 'intro' && (
              <StyledImage
                source={{ uri: card.image }}
                className="w-full h-44 rounded-2xl bg-slate-100"
                contentFit="cover"
                transition={200}
                cachePolicy="disk"
              />
            )}

            {/* 3. Code Walkthrough slide (Progressive Highlights) */}
            {slide.type === 'code' && card.code && (
              <StyledView className="rounded-2xl border border-slate-800 overflow-hidden shadow-lg bg-[#0B0F19]">
                {/* macOS Style Mock Header */}
                <StyledView className="flex-row items-center gap-1.5 px-4 py-3 bg-[#111827] border-b border-slate-800">
                  <StyledView className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                  <StyledView className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                  <StyledView className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  <StyledText className="text-slate-500 font-mono text-[10px] ml-auto">javascript</StyledText>
                </StyledView>
                
                {isCodeLoaded ? (
                  <SyntaxHighlighter
                    language="javascript"
                    style={atomOneDark}
                    customStyle={{ 
                      borderRadius: 0, 
                      padding: 16, 
                      fontSize: 12, 
                      lineHeight: 18, 
                      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                      backgroundColor: '#0B0F19' 
                    } as any}
                    // @ts-ignore
                    CodeTag={CodeText}
                    // @ts-ignore
                    PreTag={Platform.OS === 'web' ? 'pre' : View}
                  >
                    {card.code}
                  </SyntaxHighlighter>
                ) : (
                  /* Premium macOS Code Mockup Skeleton Placeholder */
                  <StyledView className="p-6 bg-[#0B0F19] min-h-[180px] gap-y-4">
                    <StyledView className="flex-row items-center gap-2">
                      <StyledView className="w-12 h-3.5 bg-slate-800/60 rounded" />
                      <StyledView className="w-24 h-3.5 bg-slate-800/40 rounded" />
                    </StyledView>
                    <StyledView className="w-3/4 h-3 bg-slate-800/60 rounded" />
                    <StyledView className="w-1/2 h-3 bg-slate-800/60 rounded" />
                    <StyledView className="w-5/6 h-3 bg-slate-800/60 rounded" />
                    <StyledView className="w-2/3 h-3 bg-slate-800/60 rounded" />
                    <StyledView className="w-4/5 h-3 bg-slate-800/60 rounded" />
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* 4. Dry Run Step Timelines */}
            {slide.type === 'dryrun' && card.examples?.length > 0 && (
              <StyledView className="gap-3 mt-1">
                <StyledText className="text-slate-400 text-[10px] font-black uppercase tracking-wider">
                  💡 Step-by-Step Test Cases
                </StyledText>
                {card.examples.map((ex, i) => (
                  <StyledView key={i} className="flex-row items-start gap-3 bg-slate-50/80 rounded-xl p-4 border border-slate-100">
                    <StyledView className="w-5 h-5 rounded-full bg-violet-100 border border-violet-200 justify-center items-center mt-0.5">
                      <StyledText className="text-violet-700 text-[10px] font-black">{i + 1}</StyledText>
                    </StyledView>
                    <StyledText className="text-slate-700 text-sm leading-relaxed font-mono flex-1">{ex}</StyledText>
                  </StyledView>
                ))}
              </StyledView>
            )}

            {/* 5. Complexity Matrix Slide */}
            {slide.type === 'complexity' && (
              <StyledView className="gap-y-4">
                <StyledText className="text-slate-500 text-sm">
                  Performance footprints showing the time and memory scales for this algorithmic approach:
                </StyledText>
                
                <StyledView className="flex-row gap-4 mt-2">
                  {/* Time Complexity Card */}
                  <StyledView className="flex-1 bg-violet-50/60 border border-violet-100 rounded-2xl p-4 items-center">
                    <BrainCircuit color="#8B5CF6" size={24} />
                    <StyledText className="text-violet-900 text-lg font-black mt-2">
                      {card.complexity?.split('/')[0] || card.complexity || 'O(N)'}
                    </StyledText>
                    <StyledText className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1">
                      Time Complexity
                    </StyledText>
                    <StyledText className="text-slate-400 text-[9px] text-center mt-2 leading-relaxed">
                      Measures instruction scales relative to input size.
                    </StyledText>
                  </StyledView>
                  
                  {/* Space Complexity Card */}
                  <StyledView className="flex-1 bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 items-center">
                    <Archive color="#10B981" size={24} />
                    <StyledText className="text-emerald-950 text-lg font-black mt-2">
                      {card.complexity?.split('/')[1] || 'O(1)'}
                    </StyledText>
                    <StyledText className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1">
                      Space Complexity
                    </StyledText>
                    <StyledText className="text-slate-400 text-[9px] text-center mt-2 leading-relaxed">
                      Measures peak heap/stack memory overhead scale.
                    </StyledText>
                  </StyledView>
                </StyledView>
                
                <StyledView className="bg-slate-50 border border-slate-100 rounded-xl p-4 mt-2">
                  <StyledText className="text-slate-500 text-[11px] leading-relaxed">
                    💡 **Note**: Optimal algorithms aim to minimize space complexity to O(1) in-place adjustments, while caching indices if a speed lookup tradeoff is desired.
                  </StyledText>
                </StyledView>
              </StyledView>
            )}

            {/* 6. Visualization Slide */}
            {slide.type === 'visualization' && (
              <StyledView className="gap-y-4">
                <StyledText className="text-slate-500 text-sm">
                  Visual pointer flow and heap trace diagram:
                </StyledText>
                
                {card.image ? (
                  <StyledView className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                    <StyledImage
                      source={{ uri: card.image }}
                      className="w-full h-48 bg-slate-50"
                      contentFit="contain"
                      transition={200}
                      cachePolicy="disk"
                    />
                  </StyledView>
                ) : (
                  <StyledView className="border-2 border-dashed border-slate-200 rounded-2xl p-8 items-center justify-center bg-slate-50">
                    <BrainCircuit color="#94A3B8" size={32} />
                    <StyledText className="text-slate-400 text-[11px] text-center mt-2 leading-relaxed font-medium">
                      Dynamic stack representation is mapped conceptually. Let the core pointer transitions guide your tracing bounds.
                    </StyledText>
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* Fallback Summary Slide */}
            {slide.type === 'summary' && (
              <StyledView className="bg-violet-50/40 rounded-2xl p-5 border border-violet-200/50 gap-4 mt-2">
                <StyledView className="flex-row items-center gap-2">
                  <StyledView className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                  <StyledText className="text-violet-800 text-[16px] font-black tracking-tight uppercase">
                    Key Takeaways
                  </StyledText>
                </StyledView>
                <StyledText className="text-slate-600 text-[14px] leading-relaxed">
                  {slide.body || 'Successfully mastered this DSA pattern! Retain this core logic for coding interviews.'}
                </StyledText>
              </StyledView>
            )}
          </AnimatedView>
        </StyledScrollView>
      </StyledView>
    </StyledView>
  );
};

export default RevisionCard;

