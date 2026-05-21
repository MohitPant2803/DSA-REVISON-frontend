import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/useAuthStore';
import { BookOpen, ArrowRight, Sparkles, Leaf } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useDashboard } from '@/hooks/useDashboard';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';

export default function DashboardScreen() {
  useAppBackHandler();
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: stats, isLoading, isError, refetch } = useDashboard();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Ensure stats.consistencyByDay is an array before mapping
  const consistencyByDay = stats?.consistencyByDay || [];
  const maxConsistency = Math.max(
    ...(consistencyByDay.map((d) => d.sessions) ?? [1]),
    1
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F7]" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} className="mb-8">
          <View className="flex-row items-center mb-2">
            <Leaf color="#86efac" size={16} />
            <Text className="text-slate-500 text-sm font-medium ml-2 tracking-wide">
              {getGreeting()}, {user?.name?.split(' ')[0] || 'friend'}
            </Text>
          </View>
          <Text className="text-slate-900 text-3xl font-bold tracking-tight">Your learning rhythm</Text>
          <Text className="text-slate-500 text-base mt-2 leading-relaxed">
            A quiet space to notice patterns — no rush, no rankings.
          </Text>
        </Animated.View>

        {isLoading && (
          <ActivityIndicator color="#7c3aed" className="my-12" />
        )}

        {isError && (
          <TouchableOpacity onPress={() => refetch()} className="bg-white p-6 rounded-2xl mb-6">
            <Text className="text-slate-600 text-center">Tap to refresh your insights</Text>
          </TouchableOpacity>
        )}

        {stats && (
          <>
            <Animated.View entering={FadeInUp.duration(450)} className="mb-6">
              <View className="bg-white rounded-[28px] p-6 border border-slate-100/80">
                <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">
                  Gentle streak
                </Text>
                <Text className="text-slate-900 text-4xl font-light">
                  {stats.streakCount}
                  <Text className="text-xl text-slate-500"> days</Text>
                </Text>
                <Text className="text-slate-500 text-sm mt-3 leading-relaxed">
                  {stats.totalRevisions} cards revisited · {Math.round(stats.totalTimeSpent / 60)} min of focus
                </Text>
                <TouchableOpacity
                  className="bg-slate-900 rounded-2xl py-4 mt-6 flex-row justify-center items-center"
                  onPress={() => router.push('/(protected)/(tabs)/reels')}
                >
                  <Text className="text-white font-semibold mr-2">Continue revising</Text>
                  <ArrowRight size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Use the consistencyByDay variable */}
            {consistencyByDay.length > 0 && (
              <Animated.View entering={FadeInUp.delay(80).duration(450)} className="mb-6">
                <Text className="text-slate-800 font-bold text-lg mb-3">This week</Text>
                <View className="bg-white rounded-[24px] p-5 flex-row items-end justify-between h-28 border border-slate-100">
                  {consistencyByDay.map((day) => ( // Use consistencyByDay here
                    <View key={day.date} className="items-center flex-1 mx-0.5">
                      <View
                        className="w-full bg-violet-200 rounded-t-md"
                        style={{
                          height: Math.max(8, (day.sessions / maxConsistency) * 72),
                        }}
                      />
                      <Text className="text-[9px] text-slate-400 mt-2">
                        {day.date.slice(5)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* Ensure weakTopics is an array */}
            {(stats.weakTopics || []).length > 0 && (
              <Animated.View entering={FadeInUp.delay(120).duration(450)} className="mb-6">
                <Text className="text-slate-800 font-bold text-lg mb-3">Topics to revisit</Text>
                {(stats.weakTopics || []).map((wt) => ( // Use fallback here
                  <TouchableOpacity
                    key={wt.topic}
                    onPress={() =>
                      router.push({
                        pathname: '/(protected)/(tabs)/reels',
                        params: { topic: wt.topic },
                      })
                    }
                    className="bg-white rounded-2xl p-4 mb-2 border border-slate-100 flex-row justify-between items-center"
                  >
                    <Text className="text-slate-800 font-medium">{wt.topic}</Text>
                    <Text className="text-slate-400 text-sm">{wt.count} marked difficult</Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}

            <Animated.View entering={FadeInUp.delay(160).duration(450)} className="mb-10">
              <Text className="text-slate-800 font-bold text-lg mb-3">Recently revised</Text>
              {/* Ensure recentlyRevised is an array */}
              {(stats.recentlyRevised || []).length === 0 ? (
                <View className="bg-white/60 rounded-2xl p-6 border border-dashed border-slate-200">
                  <Text className="text-slate-500 text-center leading-relaxed">
                    Your revision history will appear here as you swipe through cards.
                  </Text>
                </View>
              ) : (
                (stats.recentlyRevised || []).slice(0, 5).map((entry) => { // Use fallback here
                  const c = entry.card as { title?: string; topic?: string; _id?: string };
                  if (!c?.title) return null;
                  return (
                    <TouchableOpacity
                      key={entry.progressId}
                      onPress={() =>
                        router.push({
                          pathname: '/(protected)/(tabs)/reels',
                          params: { search: c.title },
                        })
                      }
                      className="bg-white rounded-2xl p-4 mb-2 border border-slate-100"
                    >
                      <Text className="text-violet-600 text-[10px] font-bold uppercase tracking-wider mb-1">
                        {c.topic}
                      </Text>
                      <Text className="text-slate-900 font-semibold">{c.title}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </Animated.View>
          </>
        )}

        <TouchableOpacity
          onPress={() => router.push('/(protected)/(tabs)/learn')}
          className="flex-row items-center bg-white rounded-2xl p-5 mb-16 border border-slate-100"
        >
          <View className="bg-violet-50 p-3 rounded-xl mr-4">
            <BookOpen color="#7c3aed" size={22} />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 font-semibold">Browse folders</Text>
            <Text className="text-slate-500 text-sm">Folders → cards → revise</Text>
          </View>
          <Sparkles color="#a78bfa" size={18} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
