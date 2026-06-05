import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, Modal, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import SyntaxHighlighter from '@/components/CustomSyntaxHighlighter';
import { Tag, Code, BookOpen, Heart, BrainCircuit, Edit, Trash2, Archive, ListMusic, MoreVertical, X, Check } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { RichText } from '@/components/RichText';

import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useUpdateCardProgress, useUpdatePlaylistMembership } from '@/services/useProgress';
import { canModifyItem, UserRole } from '@/utils/permissions';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useCardPlaylistMembership } from '@/hooks/usePlaylistMembership';
import { useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { useRole } from '@/hooks/useRole';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { useThemePalette } from '@/hooks/useThemePalette';

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
  scrollEnabled?: boolean;
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

export const RevisionCard = ({ slide, currentIndex, totalCount, onContinuePress, scrollEnabled = true }: RevisionCardProps) => {
  const { card } = slide;
  const router = useRouter();
  const palette = useThemePalette();
  const { mutate: updateProgress } = useUpdateCardProgress();
  const { mutate: updatePlaylistMembership } = useUpdatePlaylistMembership();
  const { mutate: deleteCard } = useDeleteRevisionCard();
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const { data: playlists = [] } = usePlaylists();
  const { data: membership = {} } = useCardPlaylistMembership(card._id, showPlaylistPicker);

  const { user } = useAuthStore();
  const { role } = useRole();
  const { preferences } = useUserPreferencesStore();
  const lowEndDeviceMode = !!preferences.lowEndDeviceMode;



  const [isCodeLoaded, setIsCodeLoaded] = useState(false);
  React.useEffect(() => {
    if (slide.type === 'code') {
      const delay = lowEndDeviceMode ? 500 : 250;
      // Delay rendering the heavy SyntaxHighlighter by a dynamic buffer to allow swiping animations to fully settle first
      const timeout = setTimeout(() => {
        setIsCodeLoaded(true);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [slide.type, lowEndDeviceMode]);

  const folderId =
    typeof card.folderId === 'object' && card.folderId !== null ? card.folderId._id : card.folderId;

  // Superadmin bypass for global CRUD
  const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
  const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role, user.id, card.createdBy) : false);

  const handleProgressUpdate = (action: 'favorite' | 'difficult' | 'archived') => {
    const key =
      action === 'favorite' ? 'isFavorite' : action === 'difficult' ? 'isDifficult' : 'isArchived';
    const currentValue = !!card[key];
    updateProgress({ cardId: card._id, action, value: !currentValue });
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
      pathname: '/(protected)/CreateRevisionScreen',
      params: { cardId: card._id, folderId },
    });
  };

  const renderHeadline = (headline: string) => {
    if (!headline) return null;
    if (headline.includes(':')) {
      const parts = headline.split(':');
      const category = parts[0].trim();
      const text = parts.slice(1).join(':').trim();
      return (
        <StyledView className="gap-y-1 mt-1">
          <StyledText className="text-[10px] font-black uppercase tracking-widest" style={{ color: palette.accent }}>{category}</StyledText>
          <StyledText className="text-[25px] font-black tracking-tight leading-tight" style={{ color: palette.textPrimary }}>{text}</StyledText>
        </StyledView>
      );
    }
    return (
      <StyledText className="text-[25px] font-black tracking-tight leading-tight mt-1" style={{ color: palette.textPrimary }}>
        {headline}
      </StyledText>
    );
  };

  return (
    <StyledView className="flex-1 bg-transparent pr-14">
      <StyledView className="flex-1 pt-2 pb-6">
        <StyledScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }} scrollEnabled={scrollEnabled}>
          <StyledView className="gap-y-5">
            
            {/* Horizontal Segmented Slide Indicator Track */}
            <StyledView className="flex-row gap-0.5 w-[50%] self-center mt-1 mb-2">
              {Array.from({ length: slide.totalSlides }).map((_, i) => {
                const isActive = i === slide.slideIndex;
                const isCompleted = i < slide.slideIndex;
                return (
                  <StyledView 
                    key={i} 
                    style={{
                      height: 2,
                      flex: 1,
                      borderRadius: 1,
                      backgroundColor: isActive ? palette.accent : isCompleted ? (palette.isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.12)') : (palette.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                    }} 
                  />
                );
              })}
            </StyledView>

            {/* Premium Apple-style Badge Row */}
            <StyledView className="flex-row flex-wrap gap-2 items-center">
              <StyledView 
                className="px-3 py-1 rounded-full border"
                style={{ backgroundColor: palette.accentBg, borderColor: palette.border }}
              >
                <StyledText className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: palette.accent }}>{card.topic}</StyledText>
              </StyledView>
              <StyledView 
                className="px-3 py-1 rounded-full border"
                style={{
                  backgroundColor: card.difficulty === 'Easy' ? (palette.isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5') :
                                   card.difficulty === 'Medium' ? (palette.isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB') :
                                   (palette.isDark ? 'rgba(239, 68, 68, 0.12)' : '#FFF5F5'),
                  borderColor: card.difficulty === 'Easy' ? (palette.isDark ? 'rgba(16, 185, 129, 0.2)' : '#A7F3D0') :
                               card.difficulty === 'Medium' ? (palette.isDark ? 'rgba(245, 158, 11, 0.2)' : '#FDE68A') :
                               (palette.isDark ? 'rgba(239, 68, 68, 0.2)' : '#FED7D7')
                }}
              >
                <StyledText className="text-[10px] font-extrabold uppercase tracking-wider" style={{
                  color: card.difficulty === 'Easy' ? '#10B981' :
                         card.difficulty === 'Medium' ? '#D97706' :
                         '#EF4444'
                }}>{card.difficulty}</StyledText>
              </StyledView>
              {card.complexity && (
                <StyledView 
                  className="px-3 py-1 rounded-full border"
                  style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
                >
                  <StyledText className="text-[10px] font-mono font-extrabold uppercase tracking-wider" style={{ color: palette.textSecondary }}>{card.complexity}</StyledText>
                </StyledView>
              )}
            </StyledView>

            {renderHeadline(slide.headline)}

            {/* 1. Intro / Cover & 2. Intuition / Explanation slide rendering */}
            {(slide.type === 'intro' || 
              slide.type === 'explanation' || 
              slide.type === 'intuition' ||
              slide.type === 'core-intuition' ||
              slide.type === 'deep-reasoning' ||
              slide.type === 'visual-memory' ||
              slide.type === 'elite-interview-insight') && (
              <StyledView className="gap-y-4">
                <RichText
                  text={slide.body || card.explanation || ''}
                  style={{ color: palette.textSecondary, fontSize: 15, lineHeight: 24 }}
                  boldStyle={{ color: palette.textPrimary }}
                />
              </StyledView>
            )}

            {/* Optional Cover Image */}
            {card.image && slide.type === 'intro' && (
              <StyledImage
                recycleKey={card._id}
                decodeHeight={lowEndDeviceMode ? 100 : 120}
                source={{ 
                  uri: card.image,
                  priority: slide.slideIndex === currentIndex ? 'high' : 'normal'
                }}
                className="w-full h-44 rounded-2xl bg-slate-100"
                contentFit="cover"
                transition={200}
                cachePolicy="disk"
                placeholder={{ blurhash: "L6PZ|Ye.dCg2_3trxupL~q%M9Fjt" }}
              />
            )}

            {/* 3. Code Walkthrough slide (Progressive Highlights) */}
            {slide.type === 'code' && (slide.code || card.code) && (
              (() => {
                const codeLang = 'cpp';
                const activeCode = slide.code || card.code || '';
                return (
                  <StyledView className="rounded-2xl border border-slate-800 overflow-hidden shadow-lg bg-[#0B0F19]">
                    {/* macOS Style Mock Header */}
                    <StyledView className="flex-row items-center gap-1.5 px-4 py-3 bg-[#111827] border-b border-slate-800">
                      <StyledView className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                      <StyledView className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                      <StyledView className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                      <StyledText className="text-slate-500 font-mono text-[10px] ml-auto">{codeLang}</StyledText>
                    </StyledView>
                    
                    {isCodeLoaded ? (
                      <SyntaxHighlighter
                        language={codeLang}
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
                        {activeCode}
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
                );
              })()
            )}

            {/* Pattern Trigger Recognition */}
            {slide.type === 'pattern-recognition' && (
              <StyledView className="gap-y-4">
                <RichText
                  text={slide.body || ''}
                  style={{ color: palette.textSecondary, fontSize: 15, lineHeight: 24 }}
                  boldStyle={{ color: palette.textPrimary }}
                />
                {(slide as any).flashTags && (
                  <StyledView className="flex-row flex-wrap gap-2 mt-2">
                    {(slide as any).flashTags.map((tag: string, i: number) => (
                      <StyledView 
                        key={i} 
                        className="px-3 py-1 rounded-full border"
                        style={{ backgroundColor: palette.accentBg, borderColor: palette.border }}
                      >
                        <StyledText className="text-xs font-bold" style={{ color: palette.accent }}>#{tag}</StyledText>
                      </StyledView>
                    ))}
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* 4. Dry Run Step Timelines & Interactive Grid */}
            {(slide.type === 'dryrun' || slide.type === 'dry-run') && (
              <StyledView className="gap-3 mt-1">
                {/* Render Matrix Grid if present */}
                {(slide as any).matrix && Array.isArray((slide as any).matrix) && (
                  <StyledView className="items-center my-3">
                    <StyledView 
                      className="p-3 rounded-2xl border"
                      style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
                    >
                      {(slide as any).matrix.map((row: any, rIdx: number) => {
                        if (!Array.isArray(row)) return null;
                        return (
                          <StyledView key={rIdx} className="flex-row">
                            {row.map((cell: any, cIdx: number) => (
                              <StyledView
                                key={cIdx}
                                className="w-10 h-10 border m-0.5 justify-center items-center rounded-lg"
                                style={{
                                  backgroundColor: cell === 0 ? (palette.isDark ? 'rgba(239, 68, 68, 0.2)' : '#FFE4E6') : palette.surface,
                                  borderColor: cell === 0 ? '#FDA4AF' : palette.border,
                                }}
                              >
                                <StyledText 
                                  className="font-black"
                                  style={{ color: cell === 0 ? '#E11D48' : palette.textPrimary }}
                                >
                                  {cell}
                                </StyledText>
                              </StyledView>
                            ))}
                          </StyledView>
                        );
                      })}
                    </StyledView>
                  </StyledView>
                )}

                {/* Render Steps */}
                {((Array.isArray((slide as any).steps) && (slide as any).steps.length > 0) || (Array.isArray(card.examples) && card.examples.length > 0)) && (
                  <StyledView className="gap-3">
                    <StyledText className="text-[10px] font-black uppercase tracking-wider" style={{ color: palette.textSecondary }}>
                      💡 Step-by-Step State Execution
                    </StyledText>
                    {((Array.isArray((slide as any).steps) ? (slide as any).steps : null) || (Array.isArray(card.examples) ? card.examples : [])).map((ex: string, i: number) => (
                      <StyledView 
                        key={i} 
                        className="flex-row items-start gap-3 rounded-xl p-4 border"
                        style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                      >
                        <StyledView 
                          className="w-5 h-5 rounded-full justify-center items-center mt-0.5"
                          style={{ backgroundColor: palette.accentBg }}
                        >
                          <StyledText className="text-[10px] font-black" style={{ color: palette.accent }}>{i + 1}</StyledText>
                        </StyledView>
                        <RichText 
                          text={ex || ''} 
                          style={{ color: palette.textSecondary, fontSize: 14, lineHeight: 22, flex: 1 }} 
                          boldStyle={{ color: palette.textPrimary }} 
                        />
                      </StyledView>
                    ))}
                  </StyledView>
                )}

                {/* Key Observation Highlight */}
                {(slide as any).keyObservation && (
                  <StyledView 
                    className="border rounded-xl p-4 mt-2"
                    style={{ 
                      backgroundColor: palette.isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB', 
                      borderColor: palette.isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A' 
                    }}
                  >
                    <StyledText 
                      className="text-[10px] font-black uppercase tracking-widest mb-1"
                      style={{ color: palette.isDark ? '#FBBF24' : '#B45309' }}
                    >
                      🔑 Key Observation
                    </StyledText>
                    <StyledText 
                      className="text-sm leading-relaxed font-semibold"
                      style={{ color: palette.isDark ? '#FDE68A' : '#78350F' }}
                    >
                      {(slide as any).keyObservation}
                    </StyledText>
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* Algorithm Blueprint Breakdown */}
            {slide.type === 'algorithm-breakdown' && (
              <StyledView className="gap-3 mt-1">
                {Array.isArray((slide as any).steps) && (
                  <StyledView className="gap-3">
                    <StyledText className="text-[10px] font-black uppercase tracking-wider" style={{ color: palette.textSecondary }}>
                      🧩 Algorithmic Blueprint Steps
                    </StyledText>
                    {(slide as any).steps.map((step: string, i: number) => (
                      <StyledView 
                        key={i} 
                        className="flex-row items-start gap-3 rounded-xl p-4 border"
                        style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                      >
                        <StyledView 
                          className="w-5 h-5 rounded-full justify-center items-center mt-0.5"
                          style={{ backgroundColor: palette.accentBg }}
                        >
                          <StyledText className="text-[10px] font-black" style={{ color: palette.accent }}>{i + 1}</StyledText>
                        </StyledView>
                        <RichText 
                          text={step || ''} 
                          style={{ color: palette.textSecondary, fontSize: 14, lineHeight: 22, flex: 1 }} 
                          boldStyle={{ color: palette.textPrimary }} 
                        />
                      </StyledView>
                    ))}
                  </StyledView>
                )}
                {(slide as any).mentalCompression && (
                  <StyledView 
                    className="border rounded-xl p-4 mt-2"
                    style={{ 
                      backgroundColor: palette.isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5', 
                      borderColor: palette.isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0' 
                    }}
                  >
                    <StyledText 
                      className="text-[10px] font-black uppercase tracking-widest mb-1"
                      style={{ color: palette.isDark ? '#34D399' : '#047857' }}
                    >
                      💡 Mental Compression
                    </StyledText>
                    <StyledText 
                      className="text-sm leading-relaxed font-bold"
                      style={{ color: palette.isDark ? '#A7F3D0' : '#065F46' }}
                    >
                      {(slide as any).mentalCompression}
                    </StyledText>
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* Bugs, Mistakes & Pi            {slide.type === 'pitfalls' && (
              <StyledView className="gap-4">
                {Array.isArray((slide as any).mistakes) && (
                  <StyledView className="gap-2">
                    <StyledText className="text-rose-500 text-[10px] font-black uppercase tracking-wider">
                      ⚠️ Common Bugs & Rookie Mistakes
                    </StyledText>
                    {(slide as any).mistakes.map((mistake: string, i: number) => (
                      <StyledView 
                        key={i} 
                        className="flex-row items-start gap-2 rounded-xl p-3 border"
                        style={{ 
                          backgroundColor: palette.isDark ? 'rgba(239, 68, 68, 0.08)' : '#FFF5F5', 
                          borderColor: palette.isDark ? 'rgba(239, 68, 68, 0.2)' : '#FED7D7' 
                        }}
                      >
                        <StyledText className="text-rose-600 font-bold mt-0.5">❌</StyledText>
                        <StyledText 
                          className="text-sm leading-relaxed flex-1"
                          style={{ color: palette.isDark ? '#FEB7B7' : '#9B2C2C' }}
                        >
                          {mistake}
                        </StyledText>
                      </StyledView>
                    ))}
                  </StyledView>
                )}

                {Array.isArray((slide as any).interviewerQuestions) && (
                  <StyledView className="gap-2 mt-2">
                    <StyledText className="text-[10px] font-black uppercase tracking-wider" style={{ color: palette.accent }}>
                      ❓ Potential Interviewer Follow-ups
                    </StyledText>
                    {(slide as any).interviewerQuestions.map((q: string, i: number) => (
                      <StyledView 
                        key={i} 
                        className="flex-row items-start gap-3 rounded-xl p-3 border"
                        style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                      >
                        <StyledView 
                          className="w-5 h-5 rounded-full justify-center items-center mt-0.5"
                          style={{ backgroundColor: palette.accentBg }}
                        >
                          <StyledText className="text-[10px] font-black" style={{ color: palette.accent }}>?</StyledText>
                        </StyledView>
                        <StyledText 
                          className="text-sm leading-relaxed font-bold flex-1"
                          style={{ color: palette.textPrimary }}
                        >
                          {q}
                        </StyledText>
                      </StyledView>
                    ))}
                  </StyledView>
                )}
              </StyledView>
            )}iew>
            )}

            {/* Spaced Recall Timeframes */}
            {slide.type === 'revision' && (
              <StyledView className="gap-4">
                {(slide as any).recall && typeof (slide as any).recall === 'object' && (
                  <StyledView className="gap-3">
                    <StyledText className="text-[10px] font-black uppercase tracking-wider" style={{ color: palette.textSecondary }}>
                      ⚡ Rapid Recall Compression
                    </StyledText>
                    {Object.entries((slide as any).recall).map(([time, text]: any, i) => (
                      <StyledView 
                        key={i} 
                        className="flex-row items-start gap-3 rounded-xl p-3 border"
                        style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                      >
                        <StyledView 
                          className="px-2 py-0.5 rounded border mt-0.5"
                          style={{ backgroundColor: palette.accentBg, borderColor: palette.border, borderWidth: 1 }}
                        >
                          <StyledText className="text-[9px] font-black uppercase" style={{ color: palette.accent }}>{time}</StyledText>
                        </StyledView>
                        <StyledText 
                          className="text-sm leading-relaxed flex-1 font-medium"
                          style={{ color: palette.textSecondary }}
                        >
                          {text}
                        </StyledText>
                      </StyledView>
                    ))}
                  </StyledView>
                )}

                {Array.isArray((slide as any).patternConnections) && (
                  <StyledView className="gap-2 mt-2">
                    <StyledText className="text-[10px] font-black uppercase tracking-wider" style={{ color: palette.textSecondary }}>
                      🔗 Pattern Connections & Similar Problems
                    </StyledText>
                    <StyledView className="flex-row flex-wrap gap-2">
                      {(slide as any).patternConnections.map((problem: string, i: number) => (
                        <StyledView 
                          key={i} 
                          className="px-3 py-1.5 rounded-xl border"
                          style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
                        >
                          <StyledText className="text-xs font-bold" style={{ color: palette.textSecondary }}>🔗 {problem}</StyledText>
                        </StyledView>
                      ))}
                    </StyledView>
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* 5. Complexity Matrix Slide */}
            {slide.type === 'complexity' && (
              <StyledView className="gap-y-4">
                <StyledText className="text-sm" style={{ color: palette.textSecondary }}>
                  Performance footprints showing the time and memory scales for this algorithmic approach:
                </StyledText>
                
                <StyledView className="flex-row gap-4 mt-2">
                  {/* Time Complexity Card */}
                  <StyledView 
                    className="flex-1 rounded-2xl p-4 items-center border"
                    style={{ backgroundColor: palette.isDark ? 'rgba(129, 140, 248, 0.08)' : 'rgba(139, 92, 246, 0.04)', borderColor: palette.border }}
                  >
                    <BrainCircuit color={palette.accent} size={24} />
                    <StyledText className="text-lg font-black mt-2" style={{ color: palette.accent }}>
                      {card.complexity?.split('/')[0] || card.complexity || 'O(N)'}
                    </StyledText>
                    <StyledText className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: palette.textPrimary }}>
                      Time Complexity
                    </StyledText>
                    <StyledText className="text-[9px] text-center mt-2 leading-relaxed" style={{ color: palette.textSecondary }}>
                      Measures instruction scales relative to input size.
                    </StyledText>
                  </StyledView>
                  
                  {/* Space Complexity Card */}
                  <StyledView 
                    className="flex-1 rounded-2xl p-4 items-center border"
                    style={{ backgroundColor: palette.isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.04)', borderColor: palette.border }}
                  >
                    <Archive color="#10B981" size={24} />
                    <StyledText className="text-lg font-black mt-2" style={{ color: '#10B981' }}>
                      {card.complexity?.split('/')[1] || 'O(1)'}
                    </StyledText>
                    <StyledText className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: palette.textPrimary }}>
                      Space Complexity
                    </StyledText>
                    <StyledText className="text-[9px] text-center mt-2 leading-relaxed" style={{ color: palette.textSecondary }}>
                      Measures peak heap/stack memory overhead scale.
                    </StyledText>
                  </StyledView>
                </StyledView>
                
                {slide.body ? (
                  <StyledView 
                    className="rounded-xl p-4 mt-2 border"
                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                  >
                    <RichText
                      text={slide.body}
                      style={{ color: palette.textSecondary, fontSize: 11, lineHeight: 18 }}
                      boldStyle={{ color: palette.textPrimary }}
                    />
                  </StyledView>
                ) : null}
              </StyledView>
            )}

            {/* 6. Visualization Slide */}
            {slide.type === 'visualization' && (
              <StyledView className="gap-y-4">
                <StyledText className="text-sm" style={{ color: palette.textSecondary }}>
                  Visual pointer flow and heap trace diagram:
                </StyledText>
                
                {card.image ? (
                  <StyledView 
                    className="rounded-2xl border overflow-hidden shadow-sm"
                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                  >
                    <StyledImage
                      recycleKey={card._id}
                      decodeHeight={lowEndDeviceMode ? 120 : 180}
                      source={{ 
                        uri: card.image,
                        priority: slide.slideIndex === currentIndex ? 'high' : 'normal'
                      }}
                      className="w-full h-48"
                      contentFit="contain"
                      transition={200}
                      cachePolicy="disk"
                      placeholder={{ blurhash: "L6PZ|Ye.dCg2_3trxupL~q%M9Fjt" }}
                    />
                  </StyledView>
                ) : (
                  <StyledView 
                    className="border rounded-2xl p-6 justify-center"
                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                  >
                    <RichText
                      text={slide.body || 'Dynamic stack representation is mapped conceptually. Let the core pointer transitions guide your tracing bounds.'}
                      style={{ color: palette.textSecondary, fontSize: 13, lineHeight: 20 }}
                      boldStyle={{ color: palette.textPrimary }}
                    />
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* Fallback Summary Slide */}
            {slide.type === 'summary' && (
              <StyledView 
                className="rounded-2xl p-5 gap-4 mt-2 border"
                style={{ backgroundColor: palette.surface, borderColor: palette.border }}
              >
                <StyledView className="flex-row items-center gap-2">
                  <StyledView className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.accent }} />
                  <StyledText className="text-[16px] font-black tracking-tight uppercase" style={{ color: palette.accent }}>
                    Key Takeaways
                  </StyledText>
                </StyledView>
                <RichText
                  text={slide.body || 'Successfully mastered this DSA pattern! Retain this core logic for coding interviews.'}
                  style={{ color: palette.textSecondary, fontSize: 14, lineHeight: 22 }}
                  boldStyle={{ color: palette.textPrimary }}
                />
              </StyledView>
            )}
          </StyledView>
        </StyledScrollView>
      </StyledView>
    </StyledView>
  );
};

export default RevisionCard;


