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

const GENRE_ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number }>> = {
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
  'Striver SDE Sheet': '#7C3AED',
  'Blind 75':          '#E11D48',
  'NeetCode 150':      '#059669',
  'Grind 75':          '#2563EB',
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
    <SafeAreaView className="flex-1 bg-[#FAFAFC]" edges={['top', 'left', 'right']}>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        {/* Personalized Header Section */}
        <Animated.View entering={FadeInDown.duration(400)} className="mb-8 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <View className="flex-row items-center mb-1">
              <Leaf color="#8B5CF6" size={14} strokeWidth={2.5} />
              <Text className="text-[#8B5CF6] text-xs font-black ml-2 uppercase tracking-widest">
                {getGreeting()}, {user?.name?.split(' ')[0] || 'friend'}
              </Text>
            </View>
            <Text className="text-slate-900 text-3xl font-black tracking-tight leading-tight">Your learning rhythm</Text>
            <Text className="text-slate-500 text-sm mt-2 font-medium leading-relaxed">
              {quote}
            </Text>
          </View>
          
          {/* Profile Avatar */}
          <View className="relative">
            <View 
              className="w-12 h-12 rounded-full justify-center items-center border-2 border-white shadow-sm"
              style={{
                backgroundColor: '#EDE9FE',
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
              }}
            >
              <Text className="text-violet-700 font-extrabold text-base tracking-wider">
                {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'ME'}
              </Text>
            </View>
            <View className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
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
            {/* HERO SECTION: Cute Simplistic Continue Revising Card */}
            <Animated.View entering={FadeInUp.duration(450)} className="mb-8">
              <View
                className="rounded-[24px] overflow-hidden border border-violet-400/20 shadow-md"
                style={{
                  shadowColor: '#7C3AED',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.1,
                  shadowRadius: 16,
                  elevation: 4,
                  backgroundColor: '#7C3AED',
                }}
              >
                <View className="p-6 flex-row items-center justify-between h-[160px]">
                  <View className="flex-1 pr-4" style={{ zIndex: 1 }}>
                    <Text className="text-violet-200 text-[10px] font-black uppercase tracking-widest mb-1.5">
                      Active Journey
                    </Text>
                    <Text className="text-white text-2xl font-bold tracking-tight mb-2">
                      Continue revising
                    </Text>
                    <Text className="text-violet-100 text-xs leading-relaxed mb-4">
                      {stats.totalRevisions} cards completed · {Math.round(stats.totalTimeSpent / 60)} min of calm focus.
                    </Text>
                    
                    <SpringPressable
                      onPress={() => router.push('/(protected)/(tabs)/reels')}
                      className="flex-row items-center bg-white rounded-full px-5 py-3 self-start shadow-sm"
                    >
                      <Text className="text-violet-700 font-extrabold text-xs uppercase tracking-wider mr-1.5">
                        Resume Session
                      </Text>
                      <ArrowRight size={14} color="#7C3AED" strokeWidth={3} />
                    </SpringPressable>
                  </View>

                  {/* Progress Ring */}
                  <View className="items-center justify-center relative" style={{ width: 88, height: 88, zIndex: 1 }}>
                    <Svg width={88} height={88}>
                      <Circle
                        cx={44}
                        cy={44}
                        r={34}
                        stroke="rgba(255, 255, 255, 0.15)"
                        strokeWidth={8}
                        fill="transparent"
                      />
                      <Circle
                        cx={44}
                        cy={44}
                        r={34}
                        stroke="#ffffff"
                        strokeWidth={8}
                        strokeDasharray={2 * Math.PI * 34}
                        strokeDashoffset={2 * Math.PI * 34 * (1 - Math.min(stats.streakCount / 10, 0.85))}
                        strokeLinecap="round"
                        fill="transparent"
                        transform="rotate(-90 44 44)"
                      />
                    </Svg>
                    <View className="absolute items-center justify-center">
                      <Sparkles size={20} color="#fff" />
                      <Text className="text-white text-[10px] font-black mt-1">
                        {stats.streakCount}D
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* DSA SHEETS SECTION — clean editorial list style */}
            {sheets.length > 0 && (
              <Animated.View entering={FadeInUp.delay(40).duration(400)} className="mb-8">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-slate-800 text-base font-bold tracking-tight">Study sheets</Text>
                  <SpringPressable onPress={() => router.push('/(protected)/(tabs)/learn')}>
                    <Text className="text-slate-400 text-xs font-semibold">See all</Text>
                  </SpringPressable>
                </View>

                <View
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: '#F1F5F9',
                    overflow: 'hidden',
                    shadowColor: '#0F172A',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.03,
                    shadowRadius: 12,
                    elevation: 1,
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
                          borderBottomColor: '#F8FAFC',
                        }}
                      >
                        {/* Accent stripe + icon */}
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            backgroundColor: accent + '12',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginRight: 14,
                            borderWidth: 1,
                            borderColor: accent + '22',
                          }}
                        >
                          <IconComp color={accent} size={17} />
                        </View>

                        {/* Text */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#1E293B', fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2 }}>
                            {sheet.title}
                          </Text>
                          <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '500', marginTop: 1 }}>
                            {cardCount} cards
                          </Text>
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
                  className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm"
                  style={{
                    shadowColor: '#0F172A',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.02,
                    shadowRadius: 12,
                    elevation: 1,
                  }}
                >
                  <View className="flex-row items-center justify-between mb-4">
                    <View>
                      <Text className="text-violet-600 text-[10px] font-black uppercase tracking-widest mb-1">
                        Consistency Rhythm
                      </Text>
                      <Text className="text-slate-800 text-lg font-black tracking-tight">
                        Streak momentum
                      </Text>
                    </View>
                    
                    <View 
                      className="flex-row items-center bg-violet-50 border border-violet-100 rounded-full px-3 py-1.5"
                      style={{
                        shadowColor: '#8B5CF6',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.05,
                        shadowRadius: 4,
                      }}
                    >
                      <View className="w-2.5 h-2.5 bg-violet-500 rounded-full mr-1.5" />
                      <Text className="text-violet-700 font-extrabold text-[11px] uppercase tracking-wide">
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
                          <View className="relative items-center justify-end w-4.5 h-16 rounded-full bg-slate-100/80 overflow-hidden">
                            {isCompleted ? (
                              <View 
                                className="w-full bg-violet-600 rounded-full shadow-sm"
                                style={{
                                  height: '100%',
                                  backgroundColor: '#8B5CF6',
                                }}
                              />
                            ) : (
                              <View className="w-2.5 h-2.5 rounded-full bg-slate-200 mb-1" />
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
                      backgroundColor: '#F8FAFC',
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                    }}
                  >
                    <Text style={{ color: '#475569', fontSize: 12.5, fontWeight: '600' }}>{topic}</Text>
                  </SpringPressable>
                ))}
              </ScrollView>
            </Animated.View>

            {/* WEAK TOPICS */}
            {(stats.weakTopics || []).length > 0 && (
              <Animated.View entering={FadeInUp.delay(160).duration(400)} className="mb-8">
                <Text className="text-slate-800 text-base font-bold tracking-tight mb-3">Needs more practice</Text>
                {(stats.weakTopics || []).map((wt) => (
                  <SpringPressable
                    key={wt.topic}
                    onPress={() => router.push({ pathname: '/(protected)/(tabs)/reels', params: { topic: wt.topic } })}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#fff',
                      borderRadius: 14,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: '#F1F5F9',
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
              <Text className="text-slate-800 text-base font-bold tracking-tight mb-3">Recently studied</Text>
              {(stats.recentlyRevised || []).length === 0 ? (
                <View style={{ backgroundColor: '#FAFAFA', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F1F5F9' }}>
                  <Text style={{ color: '#94A3B8', textAlign: 'center', fontSize: 13, fontWeight: '500' }}>
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
                        backgroundColor: '#fff',
                        borderRadius: 14,
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: '#F1F5F9',
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
          className="flex-row items-center bg-white rounded-[24px] p-6 mb-24 border border-slate-100 shadow-sm"
          style={{
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.02,
            shadowRadius: 12,
            elevation: 1,
          }}
        >
          <View className="bg-violet-50 p-3.5 rounded-2xl mr-4 border border-violet-100 shadow-sm">
            <BookOpen color="#8B5CF6" size={22} strokeWidth={2.5} />
          </View>
          <View className="flex-1">
            <Text className="text-slate-800 font-black text-base tracking-tight mb-0.5">Explore collections</Text>
            <Text className="text-slate-400 font-semibold text-xs">Dive into custom curation folders</Text>
          </View>
          <Sparkles color="#8B5CF6" size={18} />
        </SpringPressable>
      </ScrollView>
    </SafeAreaView>
  );
}

