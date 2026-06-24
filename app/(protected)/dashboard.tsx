import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/useAuthStore';
import { SyncIndicator } from '@/components/SyncIndicator';
import { 
  BookOpen, 
  ArrowRight, 
  Sparkles, 
  Folder,
  Layers,
  GitBranch,
  Zap,
  Database,
  Code,
  Brain,
  Book,
} from 'lucide-react-native';
import Animated, { 
  FadeInDown, 
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useDashboard } from '@/hooks/useDashboard';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { useGetFolders } from '@/hooks/useFolders';
import Svg, { Circle } from 'react-native-svg';
import { SpringPressable } from '@/components/SpringPressable';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

const MOTIVATIONAL_LINES = [
  "A quiet space to notice patterns — no rush, no rankings.",
  "Consistency is the silent path to mastery. Let's explore together.",
  "Focus is not about doing more. It is about deep, quiet clarity.",
  "Breathe in, let the concepts settle, and notice the connections.",
  "One concept at a time. Enjoy the quiet process of learning.",
  "Your mind is a beautiful forest. Nourish it with calm exploration."
];

const GENRE_ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number; strokeWidth?: number }>> = {
  folder: Folder,
  layers: Layers,
  graphs: GitBranch,
  dp: Zap,
  database: Database,
  book: Book,
  code: Code,
  brain: Brain,
};

export default function DashboardScreen() {
  useAppBackHandler();
  const router = useRouter();
  const palette = useThemePalette();
  const user = useAuthStore(s => s.user);
  const { data: stats, isLoading, isError, refetch } = useDashboard();
  const { data: foldersData } = useGetFolders({ limit: 20 });
  const sheets = foldersData?.results ?? [];
  const { width } = Dimensions.get('window');

  const shimmerValue = useSharedValue(0.3);

  React.useEffect(() => {
    shimmerValue.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1000 }),
        withTiming(0.3, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => {
    return {
      opacity: shimmerValue.value,
    };
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const quote = React.useMemo(() => {
    return MOTIVATIONAL_LINES[new Date().getDay() % MOTIVATIONAL_LINES.length];
  }, []);

  const getDayName = (dateStr: string) => {
    try {
      const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const d = new Date(dateStr);
      return days[d.getDay()];
    } catch (e) {
      return dateStr.slice(8);
    }
  };

  const getSheetAccent = (title: string) => {
    if (title === 'Striver SDE Sheet') return palette.accent;
    if (title === 'Blind 75') return palette.error;
    if (title === 'NeetCode 150') return palette.success;
    if (title === 'Grind 75') return palette.info;
    return palette.accent;
  };

  // Ensure stats.consistencyByDay is an array before mapping
  const consistencyByDay = stats?.consistencyByDay || [];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: palette.background }} edges={['top', 'left', 'right']}>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        {/* Personalized Header Section */}
        <Animated.View entering={FadeInDown.duration(400)} className="mb-8 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-2xl font-bold tracking-tight leading-normal" style={{ color: palette.textPrimary }}>
              {getGreeting()}, {user?.name?.split(' ')[0] || 'friend'}
            </Text>
            <Text className="text-sm mt-1.5 font-medium leading-relaxed mb-3" style={{ color: palette.textSecondary }}>
              {quote}
            </Text>
            <SyncIndicator />
          </View>
          
          {/* Profile Avatar */}
          <View className="relative">
            <View 
              className="w-11 h-11 rounded-full justify-center items-center border"
              style={{
                backgroundColor: palette.surface,
                borderColor: palette.border,
                shadowColor: palette.shadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.02,
                shadowRadius: 8,
              }}
            >
              <Text className="font-semibold text-sm tracking-wider" style={{ color: palette.accent }}>
                {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'ME'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {isLoading && (
          <View className="mb-10">
            {/* Hero Card Skeleton */}
            <Animated.View 
              style={[shimmerStyle, { backgroundColor: addAlpha(palette.surface, 0.6), borderColor: palette.border }]}
              className="w-full h-[180px] rounded-[28px] border p-6 mb-10 flex-row justify-between items-center"
            >
              <View className="flex-1 pr-4">
                <View className="h-3 w-24 bg-slate-200 rounded-full mb-3" />
                <View className="h-6 w-48 bg-slate-200 rounded-full mb-3" />
                <View className="h-3 w-40 bg-slate-200 rounded-full mb-5" />
                <View className="h-10 w-32 bg-slate-200 rounded-full" />
              </View>
              <View className="w-20 h-20 rounded-full bg-slate-200" />
            </Animated.View>

            {/* Streak Tracker Skeleton */}
            <Animated.View
              style={[shimmerStyle, { backgroundColor: addAlpha(palette.surface, 0.6), borderColor: palette.border }]}
              className="w-full h-[180px] rounded-[28px] border p-6 mb-8"
            >
              <View className="flex-row justify-between items-center mb-4">
                <View>
                  <View className="h-3 w-28 bg-slate-200 rounded-full mb-2" />
                  <View className="h-4 w-36 bg-slate-200 rounded-full" />
                </View>
                <View className="h-8 w-24 bg-slate-200 rounded-full" />
              </View>
              <View className="flex-row justify-between items-end px-2 pt-2">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <View key={i} className="items-center flex-1">
                    <View className="w-4.5 h-12 rounded-full bg-slate-200" />
                    <View className="h-2.5 w-4 bg-slate-200 rounded-full mt-2" />
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* Genres Title Skeleton */}
            <View className="flex-row justify-between items-center mb-4">
              <View>
                <View className="h-3 w-20 bg-slate-200/60 rounded-full mb-2" />
                <View className="h-4 w-40 bg-slate-200/60 rounded-full" />
              </View>
              <View className="h-6 w-16 bg-slate-200/60 rounded-full" />
            </View>

            {/* Genre Grid Skeleton */}
            <View className="flex-row flex-wrap justify-between mb-8">
              {[1, 2, 3, 4].map((i) => (
                <Animated.View
                  key={i}
                  style={[shimmerStyle, { backgroundColor: addAlpha(palette.surface, 0.6), borderColor: palette.border }]}
                  className="w-[48%] h-[120px] rounded-[28px] border p-5 mb-4 justify-between"
                >
                  <View className="w-10 h-10 rounded-2xl bg-slate-200" />
                  <View>
                    <View className="h-4 w-20 bg-slate-200 rounded-full mb-2" />
                    <View className="h-2 w-12 bg-slate-200 rounded-full" />
                  </View>
                </Animated.View>
              ))}
            </View>
          </View>
        )}

        {isError && (
          <SpringPressable 
            onPress={() => refetch()} 
            className="p-6 rounded-[28px] border mb-6"
            style={{ backgroundColor: addAlpha(palette.surface, 0.8), borderColor: palette.border }}
          >
            <Text className="font-semibold text-center" style={{ color: palette.textSecondary }}>
              Tap to refresh your insights
            </Text>
          </SpringPressable>
        )}

        {stats && (
          <>
            {/* HERO SECTION: Calm Tactile Continue Session Card */}
            <Animated.View entering={FadeInUp.duration(450)} className="mb-6">
              <View
                className="border p-6 rounded-[28px]"
                style={{
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  shadowColor: palette.shadow,
                  shadowOpacity: 0.03,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 2,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-6">
                    <Text className="text-[10px] font-semibold tracking-wider uppercase mb-1.5" style={{ color: palette.accent }}>
                      Continue your session
                    </Text>
                    <Text className="text-2xl font-bold tracking-tight leading-snug" style={{ color: palette.textPrimary }}>
                      Keep the flow going
                    </Text>
                    <Text className="text-xs mt-1.5 leading-relaxed" style={{ color: palette.textSecondary }}>
                      You have completed {stats.totalRevisions} cards. Let's pick up where you left off.
                    </Text>
                    
                    <SpringPressable
                      onPress={() => router.push('/(protected)/(tabs)/reels')}
                      className="flex-row items-center rounded-full px-4.5 py-2.5 mt-5 self-start shadow-sm"
                      style={{ 
                        backgroundColor: palette.accent,
                        shadowColor: palette.shadow,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8
                      }}
                    >
                      <Text className="font-semibold text-xs mr-1.5" style={{ color: palette.isDark ? palette.textPrimary : palette.surface }}>
                        Resume session
                      </Text>
                      <ArrowRight size={13} color={palette.isDark ? palette.textPrimary : palette.surface} strokeWidth={2.5} />
                    </SpringPressable>
                  </View>

                  {/* Progress Ring */}
                  <View className="items-center justify-center relative" style={{ width: 84, height: 84 }}>
                    <Svg width={84} height={84}>
                      <Circle
                        cx={42}
                        cy={42}
                        r={32}
                        stroke={addAlpha(palette.accent, 0.08)}
                        strokeWidth={7}
                        fill="transparent"
                      />
                      <Circle
                        cx={42}
                        cy={42}
                        r={32}
                        stroke={palette.accent}
                        strokeWidth={7}
                        strokeDasharray={2 * Math.PI * 32}
                        strokeDashoffset={2 * Math.PI * 32 * (1 - Math.min(stats.streakCount / 10, 0.85))}
                        strokeLinecap="round"
                        fill="transparent"
                        transform="rotate(-90 42 42)"
                      />
                    </Svg>
                    <View className="absolute items-center justify-center">
                      <Sparkles size={16} color={palette.accent} />
                      <Text className="text-[11px] font-bold mt-0.5" style={{ color: palette.textPrimary }}>
                        {stats.streakCount}d
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Quick Actions Row */}
            <Animated.View entering={FadeInUp.delay(20).duration(450)} className="flex-row justify-between mb-8" style={{ gap: 10 }}>
              <SpringPressable
                onPress={() => router.push('/(protected)/(tabs)/reels')}
                className="flex-1 border p-3.5 rounded-[20px] flex-row items-center justify-center"
                style={{
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  shadowColor: palette.shadow,
                  shadowOpacity: 0.015,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 1,
                }}
              >
                <BookOpen color={palette.accent} size={14} strokeWidth={2.2} />
                <Text className="text-xs font-semibold ml-2" style={{ color: palette.textPrimary }}>Continue Revision</Text>
              </SpringPressable>

              <SpringPressable
                onPress={() => {
                  router.push({ pathname: '/(protected)/(tabs)/reels', params: { explain: 'true' } });
                }}
                className="flex-1 border p-3.5 rounded-[20px] flex-row items-center justify-center"
                style={{
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  shadowColor: palette.shadow,
                  shadowOpacity: 0.015,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 1,
                }}
              >
                <Sparkles color={palette.accent} size={14} strokeWidth={2.2} />
                <Text className="text-xs font-semibold ml-2" style={{ color: palette.textPrimary }}>Explain to GPT</Text>
              </SpringPressable>

              <SpringPressable
                onPress={() => router.push({ pathname: '/(protected)/playlist/[playlistId]', params: { playlistId: 'hard' } })}
                className="flex-1 border p-3.5 rounded-[20px] flex-row items-center justify-center"
                style={{
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  shadowColor: palette.shadow,
                  shadowOpacity: 0.015,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 1,
                }}
              >
                <Brain color={palette.accent} size={14} strokeWidth={2.2} />
                <Text className="text-xs font-semibold ml-2" style={{ color: palette.textPrimary }}>Hard Problems</Text>
              </SpringPressable>
            </Animated.View>

            {/* DSA SHEETS SECTION — clean editorial list style */}
            {sheets.length > 0 && (
              <Animated.View entering={FadeInUp.delay(40).duration(400)} className="mb-8">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-base font-bold tracking-tight" style={{ color: palette.textPrimary }}>Study sheets</Text>
                  <SpringPressable onPress={() => router.push('/(protected)/(tabs)/learn')}>
                    <Text className="text-xs font-semibold" style={{ color: palette.textSecondary }}>See all</Text>
                  </SpringPressable>
                </View>

                <View
                  style={{
                    backgroundColor: palette.surface,
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: palette.border,
                    overflow: 'hidden',
                    shadowColor: palette.shadow,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.03,
                    shadowRadius: 14,
                    elevation: 2,
                  }}
                >
                  {sheets.map((sheet, idx) => {
                    const accent = getSheetAccent(sheet.title);
                    const IconComp = GENRE_ICON_MAP[sheet.icon] || Folder;
                    const cardCount = sheet.cardCount ?? 0;
                    const isLast = idx === sheets.length - 1;
                    return (
                      <SpringPressable
                        key={sheet._id}
                        onPress={() =>
                          router.push({
                            pathname: '/(protected)/folder/[folderId]',
                            params: { folderId: sheet._id, title: sheet.title },
                          })
                        }
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          borderBottomWidth: isLast ? 0 : 1,
                          borderBottomColor: palette.border,
                        }}
                      >
                        {/* Soft icon container */}
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            backgroundColor: palette.surface,
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginRight: 14,
                            borderWidth: 1,
                            borderColor: palette.border,
                          }}
                        >
                          <IconComp color={accent} size={15} strokeWidth={2.2} />
                        </View>

                        {/* Text */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.15 }}>
                            {sheet.title}
                          </Text>
                          {sheet.hasSubfolders === false && (
                            <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                              {cardCount === 1 ? '1 card' : `${cardCount} cards`}
                            </Text>
                          )}
                        </View>

                        <ArrowRight size={14} color={palette.textMuted} strokeWidth={2} />
                      </SpringPressable>
                    );
                  })}
                </View>
              </Animated.View>
            )}

            {/* STREAK SECTION: Apple Fitness-style weekly momentum */}
            {consistencyByDay.length > 0 && (
              <Animated.View entering={FadeInUp.delay(80).duration(450)} className="mb-8">
                <View 
                  className="rounded-[28px] p-6 border"
                  style={{
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    shadowColor: palette.shadow,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.03,
                    shadowRadius: 14,
                    elevation: 2,
                  }}
                >
                  <View className="flex-row items-center justify-between mb-4">
                    <View>
                      <Text className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: palette.accent }}>
                        Consistency Rhythm
                      </Text>
                      <Text className="text-lg font-bold tracking-tight" style={{ color: palette.textPrimary }}>
                        Streak momentum
                      </Text>
                    </View>
                    
                    <View 
                      className="flex-row items-center border rounded-full px-3 py-1.5"
                      style={{ backgroundColor: addAlpha(palette.accent, 0.05), borderColor: palette.border }}
                    >
                      <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: palette.accent }} />
                      <Text className="font-semibold text-[10px] uppercase tracking-wider" style={{ color: palette.accent }}>
                        {stats.streakCount} Day Streak
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-end justify-between px-2 pt-3 pb-1">
                    {consistencyByDay.map((day) => {
                      const isCompleted = day.sessions > 0;
                      const dayLabel = getDayName(day.date);
                      
                      return (
                        <View key={day.date} className="items-center flex-1">
                          <View 
                            className="relative items-center justify-end w-5 h-16 rounded-full overflow-hidden border"
                            style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
                          >
                            {isCompleted ? (
                              <View 
                                className="w-full rounded-full"
                                style={{
                                  height: '100%',
                                  backgroundColor: palette.accent,
                                }}
                              />
                            ) : (
                              <View className="w-2 h-2 rounded-full mb-1.5" style={{ backgroundColor: palette.textMuted }} />
                            )}
                          </View>
                          <Text className="text-[10px] font-semibold mt-2 tracking-tighter" style={{ color: palette.textMuted }}>
                            {dayLabel}
                          </Text>
                        </View>
                      );
                    })}

                  </View>

                  <Text className="text-xs text-center mt-4 italic font-medium" style={{ color: palette.textSecondary }}>
                    "Consistency is not about perfection, it's about returning."
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* Topic quick-filters — compact pill row */}
            <Animated.View entering={FadeInUp.delay(120).duration(400)} className="mb-8">
              <Text className="text-base font-bold tracking-tight mb-3" style={{ color: palette.textPrimary }}>Browse by topic</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {['Arrays', 'DP', 'Graphs', 'Trees', 'Greedy', 'Backtracking', 'Binary Search', 'Strings'].map((topic) => (
                  <SpringPressable
                    key={topic}
                    onPress={() => router.push({ pathname: '/(protected)/(tabs)/reels', params: { topic } })}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 100,
                      backgroundColor: addAlpha(palette.accent, 0.05),
                      borderWidth: 1,
                      borderColor: addAlpha(palette.accent, 0.12),
                    }}
                  >
                    <Text style={{ color: palette.textSecondary, fontSize: 12, fontWeight: '600' }}>{topic}</Text>
                  </SpringPressable>
                ))}
              </ScrollView>
            </Animated.View>

            {/* WEAK TOPICS */}
            {(stats.weakTopics || []).length > 0 && (
              <Animated.View entering={FadeInUp.delay(160).duration(400)} className="mb-8">
                <Text className="text-base font-bold tracking-tight mb-3" style={{ color: palette.textPrimary }}>Topics you're revisiting</Text>
                {(stats.weakTopics || []).map((wt) => (
                  <SpringPressable
                    key={wt.topic}
                    onPress={() => router.push({ pathname: '/(protected)/(tabs)/reels', params: { topic: wt.topic } })}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: palette.surface,
                      borderRadius: 28,
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: palette.border,
                      shadowColor: palette.shadow,
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.03,
                      shadowRadius: 14,
                      elevation: 2,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: addAlpha(palette.error, 0.5), marginRight: 12 }} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: palette.textPrimary }}>{wt.topic}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: palette.textMuted }}>{wt.count} to review</Text>
                  </SpringPressable>
                ))}
              </Animated.View>
            )}

            {/* RECENTLY REVISED */}
            <Animated.View entering={FadeInUp.delay(200).duration(400)} className="mb-10">
              <Text className="text-base font-bold tracking-tight mb-3" style={{ color: palette.textPrimary }}>Pick up where you left off</Text>
              {(stats.recentlyRevised || []).length === 0 ? (
                <View 
                  style={{ backgroundColor: palette.surface, borderRadius: 28, padding: 24, borderWidth: 1, borderColor: palette.border }}
                >
                  <Text style={{ color: palette.textSecondary, textAlign: 'center', fontSize: 13, fontWeight: '500' }}>
                    Swipe through cards — your history will appear here.
                  </Text>
                </View>
              ) : (
                (stats.recentlyRevised || []).slice(0, 5).map((entry) => {
                  const c = entry.card as { title?: string; topic?: string; _id?: string };
                  if (!c?.title) return null;
                  return (
                    <SpringPressable
                      key={entry.progressId}
                      onPress={() => router.push({ pathname: '/(protected)/(tabs)/reels', params: { search: c.title } })}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: palette.surface,
                        borderRadius: 28,
                        paddingVertical: 14,
                        paddingHorizontal: 18,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: palette.border,
                        shadowColor: palette.shadow,
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.03,
                        shadowRadius: 14,
                        elevation: 2,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2, color: palette.textMuted }}>
                          {c.topic}
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: palette.textPrimary }} numberOfLines={1}>
                          {c.title}
                        </Text>
                      </View>
                      {entry.difficult && (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: addAlpha(palette.error, 0.5), marginLeft: 12 }} />
                      )}
                    </SpringPressable>
                  );
                })
              )}
            </Animated.View>
          </>
        )}

        {/* BOTTOM REDIRECT TO FOLDER SECTION */}
        <SpringPressable
          onPress={() => router.push('/(protected)/(tabs)/learn')}
          className="flex-row items-center rounded-[28px] p-6 mb-24 border"
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
            shadowColor: palette.shadow,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.03,
            shadowRadius: 14,
            elevation: 2,
          }}
        >
          <View className="p-3.5 rounded-2xl mr-4 border" style={{ backgroundColor: addAlpha(palette.accent, 0.05), borderColor: palette.border }}>
            <BookOpen color={palette.accent} size={20} strokeWidth={2.5} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-base tracking-tight mb-0.5" style={{ color: palette.textPrimary }}>Explore collections</Text>
            <Text className="font-medium text-xs" style={{ color: palette.textSecondary }}>Dive into custom curation folders</Text>
          </View>
          <Sparkles color={palette.accent} size={18} />
        </SpringPressable>
      </ScrollView>
    </SafeAreaView>
  );
}
