import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/useAuthStore';
import { 
  BookOpen, 
  ArrowRight, 
  Sparkles, 
  Leaf,
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
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { SpringPressable } from '@/components/SpringPressable';

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

// Subtle accent per sheet — used for a single left-border stripe
const SHEET_ACCENT_MAP: Record<string, string> = {
  'Striver SDE Sheet': '#8B5CF6',
  'Blind 75':          '#FB7185',
  'NeetCode 150':      '#34D399',
  'Grind 75':          '#60A5FA',
};

export default function DashboardScreen() {
  useAppBackHandler();
  const router = useRouter();
  const { user } = useAuthStore();
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

  // Ensure stats.consistencyByDay is an array before mapping
  const consistencyByDay = stats?.consistencyByDay || [];

  return (
    <SafeAreaView className="flex-1 bg-[#FAF9F7]" edges={['top', 'left', 'right']}>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        {/* Personalized Header Section */}
        <Animated.View entering={FadeInDown.duration(400)} className="mb-8 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-[#0F172A] text-2xl font-bold tracking-tight leading-normal">
              {getGreeting()}, {user?.name?.split(' ')[0] || 'friend'}
            </Text>
            <Text className="text-[#64748B] text-sm mt-1.5 font-medium leading-relaxed">
              {quote}
            </Text>
          </View>
          
          {/* Profile Avatar */}
          <View className="relative">
            <View 
              className="w-11 h-11 rounded-full justify-center items-center border bg-white"
              style={{
                borderColor: 'rgba(148,163,184,0.10)',
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.02,
                shadowRadius: 8,
              }}
            >
              <Text className="text-[#8B5CF6] font-bold text-sm tracking-wider">
                {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'ME'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {isLoading && (
          <View className="mb-10">
            {/* Hero Card Skeleton */}
            <Animated.View 
              style={shimmerStyle}
              className="w-full h-[180px] rounded-[28px] bg-white/60 border border-white/80 p-6 mb-10 flex-row justify-between items-center"
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
              style={shimmerStyle}
              className="w-full h-[180px] rounded-[28px] bg-white/60 border border-white/80 p-6 mb-8"
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
                  style={shimmerStyle}
                  className="w-[48%] h-[120px] rounded-[28px] bg-white/60 border border-white/80 p-5 mb-4 justify-between"
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
          <SpringPressable onPress={() => refetch()} className="bg-white/80 p-6 rounded-[28px] border border-white mb-6">
            <Text className="text-slate-600 font-black text-center">Tap to refresh your insights</Text>
          </SpringPressable>
        )}

        {stats && (
          <>
            {/* HERO SECTION: Calm Tactile Continue Session Card */}
            <Animated.View entering={FadeInUp.duration(450)} className="mb-6">
              <View
                className="bg-white border p-6 rounded-[28px]"
                style={{
                  borderColor: 'rgba(148,163,184,0.10)',
                  shadowColor: '#0F172A',
                  shadowOpacity: 0.03,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 2,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-6">
                    <Text className="text-[#8B5CF6] text-[10px] font-bold tracking-wider uppercase mb-1.5">
                      Continue your session
                    </Text>
                    <Text className="text-[#0F172A] text-2xl font-bold tracking-tight leading-snug">
                      Keep the flow going
                    </Text>
                    <Text className="text-[#64748B] text-xs mt-1.5 leading-relaxed">
                      You have completed {stats.totalRevisions} cards. Let's pick up where you left off.
                    </Text>
                    
                    <SpringPressable
                      onPress={() => router.push('/(protected)/(tabs)/reels')}
                      className="flex-row items-center bg-[#8B5CF6] rounded-full px-4.5 py-2.5 mt-5 self-start shadow-sm shadow-violet-100/50"
                    >
                      <Text className="text-white font-bold text-xs mr-1.5">
                        Resume session
                      </Text>
                      <ArrowRight size={13} color="#FFFFFF" strokeWidth={2.5} />
                    </SpringPressable>
                  </View>

                  {/* Progress Ring */}
                  <View className="items-center justify-center relative" style={{ width: 84, height: 84 }}>
                    <Svg width={84} height={84}>
                      <Circle
                        cx={42}
                        cy={42}
                        r={32}
                        stroke="rgba(139, 92, 246, 0.08)"
                        strokeWidth={7}
                        fill="transparent"
                      />
                      <Circle
                        cx={42}
                        cy={42}
                        r={32}
                        stroke="#8B5CF6"
                        strokeWidth={7}
                        strokeDasharray={2 * Math.PI * 32}
                        strokeDashoffset={2 * Math.PI * 32 * (1 - Math.min(stats.streakCount / 10, 0.85))}
                        strokeLinecap="round"
                        fill="transparent"
                        transform="rotate(-90 42 42)"
                      />
                    </Svg>
                    <View className="absolute items-center justify-center">
                      <Sparkles size={16} color="#8B5CF6" />
                      <Text className="text-[#0F172A] text-[11px] font-bold mt-0.5">
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
                className="flex-1 bg-white border p-3.5 rounded-[20px] flex-row items-center justify-center"
                style={{
                  borderColor: 'rgba(148,163,184,0.10)',
                  shadowColor: '#0F172A',
                  shadowOpacity: 0.015,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 1,
                }}
              >
                <BookOpen color="#8B5CF6" size={14} strokeWidth={2.2} />
                <Text className="text-[#0F172A] text-xs font-bold ml-2">Continue Revision</Text>
              </SpringPressable>

              <SpringPressable
                onPress={() => {
                  router.push({ pathname: '/(protected)/(tabs)/reels', params: { explain: 'true' } });
                }}
                className="flex-1 bg-white border p-3.5 rounded-[20px] flex-row items-center justify-center"
                style={{
                  borderColor: 'rgba(148,163,184,0.10)',
                  shadowColor: '#0F172A',
                  shadowOpacity: 0.015,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 1,
                }}
              >
                <Sparkles color="#8B5CF6" size={14} strokeWidth={2.2} />
                <Text className="text-[#0F172A] text-xs font-bold ml-2">Explain to GPT</Text>
              </SpringPressable>

              <SpringPressable
                onPress={() => router.push({ pathname: '/(protected)/(tabs)/playlist/[playlistId]', params: { playlistId: 'hard' } })}
                className="flex-1 bg-white border p-3.5 rounded-[20px] flex-row items-center justify-center"
                style={{
                  borderColor: 'rgba(148,163,184,0.10)',
                  shadowColor: '#0F172A',
                  shadowOpacity: 0.015,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 1,
                }}
              >
                <Brain color="#8B5CF6" size={14} strokeWidth={2.2} />
                <Text className="text-[#0F172A] text-xs font-bold ml-2">Hard Problems</Text>
              </SpringPressable>
            </Animated.View>

            {/* DSA SHEETS SECTION — clean editorial list style */}
            {sheets.length > 0 && (
              <Animated.View entering={FadeInUp.delay(40).duration(400)} className="mb-8">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-[#0F172A] text-base font-bold tracking-tight">Study sheets</Text>
                  <SpringPressable onPress={() => router.push('/(protected)/(tabs)/learn')}>
                    <Text className="text-[#64748B] text-xs font-semibold">See all</Text>
                  </SpringPressable>
                </View>

                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: 'rgba(148,163,184,0.10)',
                    overflow: 'hidden',
                    shadowColor: '#0F172A',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.03,
                    shadowRadius: 14,
                    elevation: 2,
                  }}
                >
                  {sheets.map((sheet, idx) => {
                    const accent = SHEET_ACCENT_MAP[sheet.title] || '#8B5CF6';
                    const IconComp = GENRE_ICON_MAP[sheet.icon] || Folder;
                    const cardCount = sheet.cardCount ?? 0;
                    const isLast = idx === sheets.length - 1;
                    return (
                      <SpringPressable
                        key={sheet._id}
                        onPress={() =>
                          router.push({
                            pathname: '/(protected)/(tabs)/folder/[folderId]',
                            params: { folderId: sheet._id, title: sheet.title },
                          })
                        }
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          borderBottomWidth: isLast ? 0 : 1,
                          borderBottomColor: '#F1F5F9',
                        }}
                      >
                        {/* Soft icon container */}
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            backgroundColor: '#FFFFFF',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginRight: 14,
                            borderWidth: 1,
                            borderColor: 'rgba(148, 163, 184, 0.12)',
                          }}
                        >
                          <IconComp color={accent} size={15} strokeWidth={2.2} />
                        </View>

                        {/* Text */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#0B1327', fontSize: 14, fontWeight: '700', letterSpacing: -0.15 }}>
                            {sheet.title}
                          </Text>
                          {sheet.hasSubfolders === false && (
                            <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                              {cardCount === 1 ? '1 card' : `${cardCount} cards`}
                            </Text>
                          )}
                        </View>

                        <ArrowRight size={14} color="#CBD5E1" strokeWidth={2} />
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
                  className="bg-white rounded-[28px] p-6 border"
                  style={{
                    borderColor: 'rgba(148,163,184,0.10)',
                    shadowColor: '#0F172A',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.03,
                    shadowRadius: 14,
                    elevation: 2,
                  }}
                >
                  <View className="flex-row items-center justify-between mb-4">
                    <View>
                      <Text className="text-[#8B5CF6] text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        Consistency Rhythm
                      </Text>
                      <Text className="text-[#0F172A] text-lg font-bold tracking-tight">
                        Streak momentum
                      </Text>
                    </View>
                    
                    <View 
                      className="flex-row items-center bg-[#F5F3FF] border border-[#E2E8F0] rounded-full px-3 py-1.5"
                    >
                      <View className="w-2 h-2 bg-[#8B5CF6] rounded-full mr-1.5 animate-pulse" />
                      <Text className="text-[#8B5CF6] font-extrabold text-[10px] uppercase tracking-wider">
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
                          <View className="relative items-center justify-end w-5 h-16 rounded-full bg-[#F1F5F9] overflow-hidden border border-[#E2E8F0]/30">
                            {isCompleted ? (
                              <View 
                                className="w-full rounded-full"
                                style={{
                                  height: '100%',
                                  backgroundColor: '#8B5CF6',
                                }}
                              />
                            ) : (
                              <View className="w-2 h-2 rounded-full bg-slate-200 mb-1.5" />
                            )}
                          </View>
                          <Text className="text-[10px] text-slate-400 font-black mt-2 tracking-tighter">
                            {dayLabel}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <Text className="text-slate-500 text-xs text-center mt-4 italic font-medium">
                    "Consistency is not about perfection, it's about returning."
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* Topic quick-filters — compact pill row */}
            <Animated.View entering={FadeInUp.delay(120).duration(400)} className="mb-8">
              <Text className="text-slate-800 text-base font-bold tracking-tight mb-3">Browse by topic</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {['Arrays', 'DP', 'Graphs', 'Trees', 'Greedy', 'Backtracking', 'Binary Search', 'Strings'].map((topic) => (
                  <SpringPressable
                    key={topic}
                    onPress={() => router.push({ pathname: '/(protected)/(tabs)/reels', params: { topic } })}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 100,
                      backgroundColor: 'rgba(139, 92, 246, 0.05)',
                      borderWidth: 1,
                      borderColor: 'rgba(139, 92, 246, 0.12)',
                    }}
                  >
                    <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '600' }}>{topic}</Text>
                  </SpringPressable>
                ))}
              </ScrollView>
            </Animated.View>

            {/* WEAK TOPICS */}
            {(stats.weakTopics || []).length > 0 && (
              <Animated.View entering={FadeInUp.delay(160).duration(400)} className="mb-8">
                <Text className="text-[#0F172A] text-base font-bold tracking-tight mb-3">Topics you're revisiting</Text>
                {(stats.weakTopics || []).map((wt) => (
                  <SpringPressable
                    key={wt.topic}
                    onPress={() => router.push({ pathname: '/(protected)/(tabs)/reels', params: { topic: wt.topic } })}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#FFFFFF',
                      borderRadius: 28,
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.10)',
                      shadowColor: '#0F172A',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.03,
                      shadowRadius: 14,
                      elevation: 2,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FDA4AF', marginRight: 12 }} />
                      <Text style={{ color: '#334155', fontSize: 13, fontWeight: '600' }}>{wt.topic}</Text>
                    </View>
                    <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '500' }}>{wt.count} to review</Text>
                  </SpringPressable>
                ))}
              </Animated.View>
            )}

            {/* RECENTLY REVISED */}
            <Animated.View entering={FadeInUp.delay(200).duration(400)} className="mb-10">
              <Text className="text-[#0F172A] text-base font-bold tracking-tight mb-3">Pick up where you left off</Text>
              {(stats.recentlyRevised || []).length === 0 ? (
                <View 
                  style={{ backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, borderWidth: 1, borderColor: 'rgba(148,163,184,0.10)' }}
                >
                  <Text style={{ color: '#64748B', textAlign: 'center', fontSize: 13, fontWeight: '500' }}>
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
                        backgroundColor: '#FFFFFF',
                        borderRadius: 28,
                        paddingVertical: 14,
                        paddingHorizontal: 18,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: 'rgba(148,163,184,0.10)',
                        shadowColor: '#0F172A',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.03,
                        shadowRadius: 14,
                        elevation: 2,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
                          {c.topic}
                        </Text>
                        <Text style={{ color: '#1E293B', fontSize: 13, fontWeight: '600', letterSpacing: -0.1 }} numberOfLines={1}>
                          {c.title}
                        </Text>
                      </View>
                      {entry.difficult && (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FDA4AF', marginLeft: 12 }} />
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
          className="flex-row items-center bg-white rounded-[28px] p-6 mb-24 border"
          style={{
            borderColor: 'rgba(148,163,184,0.10)',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.03,
            shadowRadius: 14,
            elevation: 2,
          }}
        >
          <View className="bg-[#F5F3FF] p-3.5 rounded-2xl mr-4 border" style={{ borderColor: 'rgba(139, 92, 246, 0.08)' }}>
            <BookOpen color="#8B5CF6" size={20} strokeWidth={2.5} />
          </View>
          <View className="flex-1">
            <Text className="text-[#0F172A] font-bold text-base tracking-tight mb-0.5">Explore collections</Text>
            <Text className="text-[#64748B] font-medium text-xs">Dive into custom curation folders</Text>
          </View>
          <Sparkles color="#8B5CF6" size={18} />
        </SpringPressable>
      </ScrollView>
    </SafeAreaView>
  );
}

