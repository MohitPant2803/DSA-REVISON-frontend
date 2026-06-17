import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, Modal, ActivityIndicator, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import SyntaxHighlighter from '@/components/CustomSyntaxHighlighter';
import { Tag, Code, BookOpen, Heart, BrainCircuit, Edit, Trash2, Archive, ListMusic, MoreVertical, X, Check, Maximize2 } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { RichText } from '@/components/RichText';

import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useUpdateCardProgress, useUpdatePlaylistMembership } from '@/services/useProgress';
import { canModifyItem, UserRole } from '@/utils/permissions';

import { useDeleteRevisionCard, useUpdateRevisionCard } from '@/hooks/useRevisionCards';
import { useRole } from '@/hooks/useRole';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

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
  const palette = useThemePalette();
  const getStyles = (diff: string) => {
    if (diff === 'Easy') {
      return { bg: addAlpha(palette.success, 0.08), border: addAlpha(palette.success, 0.15), text: palette.success };
    }
    if (diff === 'Medium') {
      return { bg: addAlpha(palette.warning, 0.08), border: addAlpha(palette.warning, 0.15), text: palette.warning };
    }
    return { bg: addAlpha(palette.error, 0.08), border: addAlpha(palette.error, 0.15), text: palette.error };
  };
  const styles = getStyles(difficulty);
  return (
    <StyledView className="px-4 py-1.5 rounded-full border" style={{ backgroundColor: styles.bg, borderColor: styles.border }}>
      <StyledText className="font-semibold text-sm" style={{ color: styles.text }}>{difficulty}</StyledText>
    </StyledView>
  );
};

const TopicBadge = ({ topic }: { topic: string }) => {
  const palette = useThemePalette();
  return (
    <StyledView className="flex-row items-center gap-2 px-3 py-1 rounded-full border" style={{ backgroundColor: palette.accentBg, borderColor: palette.border }}>
      <Tag color={palette.accent} size={16} />
      <StyledText className="font-semibold text-sm" style={{ color: palette.accent }}>{topic}</StyledText>
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
  const { mutate: updateCard } = useUpdateRevisionCard();

  const [isEditingCode, setIsEditingCode] = useState(false);
  const [editedCode, setEditedCode] = useState(slide.code || '');
  const [isFullscreenCodeOpen, setIsFullscreenCodeOpen] = useState(false);
  const [zoomFontSize, setZoomFontSize] = useState(12);

  React.useEffect(() => {
    setEditedCode(slide.code || '');
  }, [slide.code]);

  const handleSaveCode = () => {
    const updatedSlides = card.slides ? card.slides.map((s, idx) => {
      if (idx === slide.slideIndex) {
        return { ...s, code: editedCode };
      }
      return s;
    }) : [];

    updateCard(
      {
        cardId: card._id,
        updateData: {
          code: editedCode,
          slides: updatedSlides,
        },
      },
      {
        onSuccess: () => {
          Toast.show({
            type: 'success',
            text1: 'Code updated successfully',
          });
          setIsEditingCode(false);
        },
        onError: (err) => {
          Toast.show({
            type: 'error',
            text1: 'Failed to update code',
            text2: err.message,
          });
        },
      }
    );
  };

  const handleCancelCode = () => {
    setEditedCode(slide.code || '');
    setIsEditingCode(false);
  };


  const { user } = useAuthStore();
  const { role } = useRole();
  const { preferences } = useUserPreferencesStore();
  const lowEndDeviceMode = !!preferences.lowEndDeviceMode;

  const [isCodeLoaded, setIsCodeLoaded] = useState(false);
  React.useEffect(() => {
    if (slide.type === 'code') {
      const delay = lowEndDeviceMode ? 500 : 250;
      const timeout = setTimeout(() => {
        setIsCodeLoaded(true);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [slide.type, lowEndDeviceMode]);

  const folderId =
    typeof card.folderId === 'object' && card.folderId !== null ? card.folderId._id : card.folderId;

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
          <StyledText className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: palette.accent }}>{category.toUpperCase()}</StyledText>
          <StyledText className="text-[22px] font-semibold tracking-tight leading-tight" style={{ color: palette.textPrimary }}>{text}</StyledText>
        </StyledView>
      );
    }
    return (
      <StyledText className="text-[22px] font-semibold tracking-tight leading-tight mt-1" style={{ color: palette.textPrimary }}>
        {headline}
      </StyledText>
    );
  };

  const diffBadgeStyles = (() => {
    const diff = card.difficulty || 'Medium';
    if (diff === 'Easy') {
      return {
        bg: addAlpha(palette.success, 0.08),
        border: addAlpha(palette.success, 0.15),
        text: palette.success,
      };
    }
    if (diff === 'Medium') {
      return {
        bg: addAlpha(palette.warning, 0.08),
        border: addAlpha(palette.warning, 0.15),
        text: palette.warning,
      };
    }
    return {
      bg: addAlpha(palette.error, 0.08),
      border: addAlpha(palette.error, 0.15),
      text: palette.error,
    };
  })();

  return (
    <StyledView className="flex-1 bg-transparent pr-14">
      <StyledView className="flex-1 pt-2 pb-6">
        <StyledScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }} scrollEnabled={scrollEnabled}>
          <StyledView className="gap-y-5">
            
            {/* Horizontal Segmented Slide Indicator Track */}
            {slide.slideIndex > 0 && (
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
                        backgroundColor: isActive ? palette.accent : isCompleted ? addAlpha(palette.textPrimary, 0.25) : addAlpha(palette.textPrimary, 0.08)
                      }} 
                    />
                  );
                })}
              </StyledView>
            )}

            {/* Premium Apple-style Badge Row - Only visible on the first slide */}
            {slide.slideIndex === 0 && (
              <StyledView className="flex-row flex-wrap gap-2 items-center">
                {card.topic && card.topic.trim() ? (
                  <StyledView 
                    className="px-3 py-1 rounded-full border"
                    style={{ backgroundColor: palette.accentBg, borderColor: palette.border }}
                  >
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.accent }}>{card.topic}</StyledText>
                  </StyledView>
                ) : null}
                {card.difficulty && card.difficulty.trim() ? (
                  <StyledView 
                    className="px-3 py-1 rounded-full border"
                    style={{
                      backgroundColor: diffBadgeStyles.bg,
                      borderColor: diffBadgeStyles.border
                    }}
                  >
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: diffBadgeStyles.text }}>
                      {card.difficulty}
                    </StyledText>
                  </StyledView>
                ) : null}
                {card.complexity && (
                  <StyledView 
                    className="px-3 py-1 rounded-full border"
                    style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
                  >
                    <StyledText className="text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: palette.textSecondary }}>{card.complexity}</StyledText>
                  </StyledView>
                )}
              </StyledView>
            )}

            {slide.type === 'intro' ? (
              <StyledView className="gap-y-4">
                {/* Card Title at the top */}
                <StyledText
                  style={{ fontSize: 24, fontWeight: '600', color: palette.textPrimary, letterSpacing: -0.3, lineHeight: 28, marginTop: 4 }}
                  numberOfLines={2}
                >
                  {card.title}
                </StyledText>

                {/* Spacer / Margin */}
                <StyledView style={{ height: 12 }} />

                {/* Curved themed box in the center of the slide */}
                <StyledView 
                  style={{ 
                    backgroundColor: palette.readingSurface, 
                    borderRadius: 24, 
                    borderWidth: 1, 
                    borderColor: palette.readingBorder 
                  }}
                >
                  <StyledView className="p-4 gap-y-3">
                    <StyledView className="flex-row items-center justify-between">
                      {/* <StyledText className="font-semibold tracking-tight text-[20px] leading-tight" style={{ color: palette.textPrimary }}>
                        🎯 {slide.headline}
                      </StyledText> */}
                    </StyledView>
                    <StyledView className="mt-1.5">
                      <RichText
                        text={`🎯 ${slide.body || ''}`}
                        style={{ color: palette.textSecondary, fontSize: 15, lineHeight: 24, fontWeight: '400' }}
                        boldStyle={{ color: palette.textPrimary, fontWeight: '600' }}
                      />
                    </StyledView>
                  </StyledView>
                </StyledView>

                {/* Optional Cover Image */}
                {card.image && (
                  <StyledImage
                    recycleKey={card._id}
                    decodeHeight={lowEndDeviceMode ? 100 : 120}
                    source={{ 
                      uri: card.image,
                      priority: slide.slideIndex === currentIndex ? 'high' : 'normal'
                    }}
                    className="w-full h-44 rounded-2xl mt-4"
                    style={{ backgroundColor: palette.inputBg }}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="disk"
                    placeholder={{ blurhash: "L6PZ|Ye.dCg2_3trxupL~q%M9Fjt" }}
                  />
                )}
              </StyledView>
            ) : (
              <>
                {renderHeadline(slide.headline)}

                {/* 2. Intuition / Explanation slide rendering */}
                {(slide.type === 'explanation' || 
                  slide.type === 'intuition' ||
                  slide.type === 'core-intuition' ||
                  slide.type === 'deep-reasoning' ||
                  slide.type === 'visual-memory' ||
                  slide.type === 'elite-interview-insight') && (
                  <StyledView className="gap-y-4">
                    <RichText
                      text={slide.body || ''}
                      style={{ color: palette.textSecondary, fontSize: 15, lineHeight: 24 }}
                      boldStyle={{ color: palette.textPrimary }}
                    />
                  </StyledView>
                )}
              </>
            )}

            {/* 3. Code Walkthrough slide (Progressive Highlights) */}
            {slide.type === 'code' && slide.code && (
              (() => {
                const codeLang = 'cpp';
                const activeCode = slide.code || '';
                return (
                  <StyledView 
                    className="rounded-2xl border overflow-hidden shadow-lg"
                    style={{ backgroundColor: '#090E1A', borderColor: '#1E293B' }}
                  >
                    {/* macOS Style Mock Header */}
                    <StyledView 
                      className="flex-row items-center gap-1.5 px-4 py-3 border-b"
                      style={{ backgroundColor: '#111827', borderBottomColor: '#1E293B' }}
                    >
                      <StyledView className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.error }} />
                      <StyledView className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.warning }} />
                      <StyledView className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.success }} />
                      
                      {/* Action buttons (Edit/Save/Cancel) */}
                      <StyledView className="flex-row items-center gap-2 ml-auto">
                        {isEditingCode ? (
                          <>
                            <StyledTouchableOpacity 
                              onPress={handleSaveCode}
                              className="px-2.5 py-1 rounded bg-blue-500/20 border border-blue-500/30"
                            >
                              <StyledText className="text-[10px] font-semibold text-blue-400">Save</StyledText>
                            </StyledTouchableOpacity>
                            <StyledTouchableOpacity 
                              onPress={handleCancelCode}
                              className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700"
                            >
                              <StyledText className="text-[10px] font-semibold text-zinc-400">Cancel</StyledText>
                            </StyledTouchableOpacity>
                          </>
                        ) : (
                          <StyledView className="flex-row items-center gap-2">
                            <StyledTouchableOpacity 
                              onPress={() => setIsEditingCode(true)}
                              className="flex-row items-center gap-1 px-2.5 py-1 rounded bg-zinc-800/80 border border-zinc-700/60"
                            >
                              <Edit size={10} color="#94A3B8" />
                              <StyledText className="text-[10px] font-semibold font-mono" style={{ color: '#94A3B8' }}>{codeLang.toUpperCase()}</StyledText>
                            </StyledTouchableOpacity>
                            <StyledTouchableOpacity 
                              onPress={() => setIsFullscreenCodeOpen(true)}
                              className="flex-row items-center justify-center p-1 rounded bg-zinc-800/80 border border-zinc-700/60"
                            >
                              <Maximize2 size={12} color="#94A3B8" />
                            </StyledTouchableOpacity>
                          </StyledView>
                        )}
                      </StyledView>
                    </StyledView>
                    
                    {isCodeLoaded ? (
                      isEditingCode ? (
                        <TextInput
                          value={editedCode}
                          onChangeText={setEditedCode}
                          multiline
                          style={{
                            color: '#abb2bf',
                            fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                            fontSize: 12,
                            lineHeight: 18,
                            padding: 16,
                            backgroundColor: '#090E1A',
                            minHeight: 200,
                            textAlignVertical: 'top',
                          }}
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                        />
                      ) : (
                        <SyntaxHighlighter
                          language={codeLang}
                          style={atomOneDark}
                          customStyle={{ 
                            borderRadius: 0, 
                            padding: 16, 
                            fontSize: 12, 
                            lineHeight: 18, 
                            fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                            backgroundColor: '#090E1A' 
                          } as any}
                          // @ts-ignore
                          CodeTag={CodeText}
                          // @ts-ignore
                          PreTag={Platform.OS === 'web' ? 'pre' : View}
                        >
                          {activeCode}
                        </SyntaxHighlighter>
                      )
                    ) : (
                      /* Premium macOS Code Mockup Skeleton Placeholder */
                      <StyledView className="p-6 min-h-[180px] gap-y-4" style={{ backgroundColor: '#090E1A' }}>
                        <StyledView className="flex-row items-center gap-2">
                          <StyledView className="w-12 h-3.5 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                          <StyledView className="w-24 h-3.5 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
                        </StyledView>
                        <StyledView className="w-3/4 h-3 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                        <StyledView className="w-1/2 h-3 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                        <StyledView className="w-5/6 h-3 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                        <StyledView className="w-2/3 h-3 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                        <StyledView className="w-4/5 h-3 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
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
                        <StyledText className="text-xs font-semibold" style={{ color: palette.accent }}>#{tag}</StyledText>
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
                                  backgroundColor: cell === 0 ? addAlpha(palette.error, 0.08) : palette.surface,
                                  borderColor: cell === 0 ? addAlpha(palette.error, 0.15) : palette.border,
                                }}
                              >
                                <StyledText 
                                  className="font-bold"
                                  style={{ color: cell === 0 ? palette.error : palette.textPrimary }}
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
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.textSecondary }}>

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
                          {/* <StyledText className="text-[10px] font-semibold" style={{ color: palette.accent }}>{i + 1}</StyledText> */}
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
                      backgroundColor: addAlpha(palette.warning, 0.08), 
                      borderColor: addAlpha(palette.warning, 0.15) 
                    }}
                  >
                    <StyledText 
                      className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                      style={{ color: palette.warning }}
                    >
                      🔑 Key Observation
                    </StyledText>
                    <StyledText 
                      className="text-sm leading-relaxed font-semibold"
                      style={{ color: palette.textPrimary }}
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
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.textSecondary }}>
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
                          <StyledText className="text-[10px] font-semibold" style={{ color: palette.accent }}>{i + 1}</StyledText>
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
                      backgroundColor: addAlpha(palette.success, 0.08), 
                      borderColor: addAlpha(palette.success, 0.15) 
                    }}
                  >
                    <StyledText 
                      className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                      style={{ color: palette.success }}
                    >
                      💡 Mental Compression
                    </StyledText>
                    <StyledText 
                      className="text-sm leading-relaxed font-semibold"
                      style={{ color: palette.textPrimary }}
                    >
                      {(slide as any).mentalCompression}
                    </StyledText>
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* Common Mistakes & Interview follow-ups */}
            {slide.type === 'pitfalls' && (
              <StyledView className="gap-4">
                {Array.isArray((slide as any).mistakes) && (
                  <StyledView className="gap-2">
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.error }}>
                      ⚠️ Common Bugs & Rookie Mistakes
                    </StyledText>
                    {(slide as any).mistakes.map((mistake: string, i: number) => (
                      <StyledView 
                        key={i} 
                        className="flex-row items-start gap-2 rounded-xl p-3 border"
                        style={{ 
                          backgroundColor: addAlpha(palette.error, 0.08), 
                          borderColor: addAlpha(palette.error, 0.15) 
                        }}
                      >
                        <StyledText style={{ color: palette.error, fontWeight: 'bold', marginTop: 2 }}>❌</StyledText>
                        <StyledText 
                          className="text-sm leading-relaxed flex-1 font-semibold"
                          style={{ color: palette.textPrimary }}
                        >
                          {mistake}
                        </StyledText>
                      </StyledView>
                    ))}
                  </StyledView>
                )}

                {Array.isArray((slide as any).interviewerQuestions) && (
                  <StyledView className="gap-2 mt-2">
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.accent }}>
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
                          <StyledText className="text-[10px] font-semibold" style={{ color: palette.accent }}>?</StyledText>
                        </StyledView>
                        <StyledText 
                          className="text-sm leading-relaxed font-semibold flex-1"
                          style={{ color: palette.textPrimary }}
                        >
                          {q}
                        </StyledText>
                      </StyledView>
                    ))}
                  </StyledView>
                )}
              </StyledView>
            )}

            {/* Spaced Recall Timeframes */}
            {slide.type === 'revision' && (
              <StyledView className="gap-4">
                {(slide as any).recall && typeof (slide as any).recall === 'object' && (
                  <StyledView className="gap-3">
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.textSecondary }}>
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
                          <StyledText className="text-[9px] font-semibold uppercase" style={{ color: palette.accent }}>{time}</StyledText>
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
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.textSecondary }}>
                      🔗 Pattern Connections & Similar Problems
                    </StyledText>
                    <StyledView className="flex-row flex-wrap gap-2">
                      {(slide as any).patternConnections.map((problem: string, i: number) => (
                        <StyledView 
                          key={i} 
                          className="px-3 py-1.5 rounded-xl border"
                          style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
                        >
                          <StyledText className="text-xs font-semibold" style={{ color: palette.textSecondary }}>🔗 {problem}</StyledText>
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
                    style={{ backgroundColor: addAlpha(palette.accent, 0.08), borderColor: palette.border }}
                  >
                    <BrainCircuit color={palette.accent} size={24} />
                    <StyledText className="text-lg font-bold mt-2" style={{ color: palette.accent }}>
                      {card.complexity?.split('/')[0] || card.complexity || 'O(N)'}
                    </StyledText>
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: palette.textPrimary }}>
                      Time Complexity
                    </StyledText>
                    <StyledText className="text-[9px] text-center mt-2 leading-relaxed" style={{ color: palette.textSecondary }}>
                      Measures instruction scales relative to input size.
                    </StyledText>
                  </StyledView>
                  
                  {/* Space Complexity Card */}
                  <StyledView 
                    className="flex-1 rounded-2xl p-4 items-center border"
                    style={{ backgroundColor: addAlpha(palette.success, 0.08), borderColor: palette.border }}
                  >
                    <Archive color={palette.success} size={24} />
                    <StyledText className="text-lg font-bold mt-2" style={{ color: palette.success }}>
                      {card.complexity?.split('/')[1] || 'O(1)'}
                    </StyledText>
                    <StyledText className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: palette.textPrimary }}>
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
                  <StyledText className="text-[16px] font-semibold tracking-tight uppercase" style={{ color: palette.accent }}>
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

      <Modal
        visible={isFullscreenCodeOpen}
        animationType="fade"
        presentationStyle="overFullScreen"
        transparent={true}
        onRequestClose={() => setIsFullscreenCodeOpen(false)}
      >
        <StyledView className="flex-1 bg-[#090E1A] pt-12 pb-6 px-4">
          {/* Header */}
          <StyledView className="flex-row items-center justify-between pb-4 border-b border-zinc-800/60 mb-4">
            <StyledView className="flex-1 mr-4">
              <StyledText className="text-[10px] font-semibold uppercase tracking-widest text-blue-400 mb-0.5">
                {card.topic || 'DSA CODE'}
              </StyledText>
              <StyledText className="text-lg font-bold text-white leading-tight" numberOfLines={1}>
                {card.title}
              </StyledText>
            </StyledView>
            
            {/* Controls */}
            <StyledView className="flex-row items-center gap-3">
              {/* Zoom Out Button */}
              <StyledTouchableOpacity 
                onPress={() => setZoomFontSize(prev => Math.max(8, prev - 1))}
                className="w-8 h-8 rounded-lg bg-zinc-800/80 border border-zinc-700/60 items-center justify-center"
              >
                <StyledText className="text-white text-xs font-semibold">A-</StyledText>
              </StyledTouchableOpacity>
              
              {/* Zoom Indicator */}
              <StyledText className="text-zinc-400 font-mono text-xs w-6 text-center">{zoomFontSize}</StyledText>
              
              {/* Zoom In Button */}
              <StyledTouchableOpacity 
                onPress={() => setZoomFontSize(prev => Math.min(24, prev + 1))}
                className="w-8 h-8 rounded-lg bg-zinc-800/80 border border-zinc-700/60 items-center justify-center"
              >
                <StyledText className="text-white text-xs font-semibold">A+</StyledText>
              </StyledTouchableOpacity>

              {/* Close Button */}
              <StyledTouchableOpacity 
                onPress={() => setIsFullscreenCodeOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 items-center justify-center"
              >
                <X size={16} color="#FFFFFF" />
              </StyledTouchableOpacity>
            </StyledView>
          </StyledView>

          {/* Code Body */}
          <StyledView className="flex-1 rounded-2xl border border-zinc-800/60 overflow-hidden bg-[#090E1A]">
            <ScrollView 
              showsVerticalScrollIndicator={true}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 12 }}
            >
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={true}
                style={{ flex: 1 }}
                contentContainerStyle={{ minWidth: '100%', paddingHorizontal: 16 }}
              >
                <SyntaxHighlighter
                  language="cpp"
                  style={atomOneDark}
                  fontSize={zoomFontSize}
                  customStyle={{ 
                    borderRadius: 0, 
                    padding: 0, 
                    fontSize: zoomFontSize, 
                    lineHeight: Math.round(zoomFontSize * 1.5), 
                    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                    backgroundColor: '#090E1A',
                  } as any}
                  // @ts-ignore
                  CodeTag={CodeText}
                  // @ts-ignore
                  PreTag={Platform.OS === 'web' ? 'pre' : View}
                >
                  {slide.code || ''}
                </SyntaxHighlighter>
              </ScrollView>
            </ScrollView>
          </StyledView>
        </StyledView>
      </Modal>

    </StyledView>
  );
};

export default RevisionCard;


