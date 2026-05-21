import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../../src/store/useAppStore';
import { Search, BookOpen, Target, Activity, ArrowRight, PackageOpen, Clock } from 'lucide-react-native';
import { SheetCard } from '../../../src/components/SheetCard';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

export default function DashboardScreen() {
  const user = useAppStore(state => state.user);
  const sheets = useAppStore(state => state.sheets);
  const searchQuery = useAppStore(state => state.searchQuery);
  const setSearchQuery = useAppStore(state => state.setSearchQuery);

  const [quickAccessItems, setQuickAccessItems] = useState<string[]>(['Blind 75', 'Graphs', 'Favorites', 'Revision']);
  const [isQuickAccessLoading, setIsQuickAccessLoading] = useState(false);
  const [quickAccessError, setQuickAccessError] = useState<string | null>(null);

  const [reviewAreas, setReviewAreas] = useState([
    { id: '1', title: 'Dynamic Prog.', type: 'target' as const },
    { id: '2', title: 'Graphs', type: 'activity' as const }
  ]);
  const [isReviewAreasLoading, setIsReviewAreasLoading] = useState(false);
  const [reviewAreasError, setReviewAreasError] = useState<string | null>(null);

  const filteredSheets = sheets.filter(sheet =>
    sheet.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const activeSheet = sheets[0];

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F7]" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>

        {/* Minimal Header */}
        <Animated.View entering={FadeInDown.duration(400)} className="mb-8">
          <Text className="text-slate-500 text-[15px] font-semibold tracking-wide mb-1 uppercase">{getGreeting()}, {user?.name || 'Explorer'}</Text>
          <Text className="text-slate-900 text-3xl font-bold tracking-tight">Continue learning</Text>
        </Animated.View>

        {/* Primary Continue Card */}
        {activeSheet && (
          <Animated.View entering={FadeInUp.duration(500)} className="mb-8">
            <View className="bg-white rounded-[32px] p-6 shadow-xl shadow-black/5 border border-white/50">
              <View className="flex-row items-center justify-between mb-8">
                <View className="flex-row items-center">
                  <View className="w-14 h-14 bg-zinc-100 rounded-2xl items-center justify-center mr-4">
                    <BookOpen color="#475569" size={24} />
                  </View>
                  <View>
                    <Text className="text-slate-800 text-xl font-bold mb-1">{activeSheet.title}</Text>
                    <View className="flex-row items-center">
                      <Clock color="#94a3b8" size={14} />
                      <Text className="text-slate-500 text-[15px] ml-1.5 font-medium">In progress</Text>
                    </View>
                  </View>
                </View>
              </View>
              <TouchableOpacity className="bg-slate-900 rounded-2xl w-full py-4 flex-row items-center justify-center" activeOpacity={0.8}>
                <Text className="text-white font-semibold text-base mr-2">Continue</Text>
                <ArrowRight size={18} color="white" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Quick Access Pills */}
        <Animated.View entering={FadeInUp.duration(600)} className="mb-8">
          <Text className="text-slate-800 text-[18px] font-bold tracking-tight mb-4">Quick Access</Text>
          {isQuickAccessLoading ? (
            <ActivityIndicator size="small" color="#475569" className="self-start" />
          ) : quickAccessError ? (
            <Text className="text-red-500 text-[14px]">{quickAccessError}</Text>
          ) : quickAccessItems.length === 0 ? (
            <View className="bg-white/40 border border-black/[0.03] rounded-2xl p-4">
              <Text className="text-[#8E8E93] text-[14px] font-medium italic">
                No shortcuts established.
              </Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-3">
              {quickAccessItems.map((item) => (
                <TouchableOpacity key={item} className="bg-slate-200/60 px-5 py-3 rounded-full border border-slate-200/50" activeOpacity={0.7}>
                  <Text className="text-slate-700 font-semibold text-[15px]">{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>

        {/* Compact Weak Areas */}
        <Animated.View entering={FadeInUp.duration(700)} className="mb-8">
          <Text className="text-slate-800 text-[18px] font-bold tracking-tight mb-4">Areas to Review</Text>
          {isReviewAreasLoading ? (
            <ActivityIndicator size="small" color="#475569" className="self-start" />
          ) : reviewAreasError ? (
            <Text className="text-red-500 text-[14px]">{reviewAreasError}</Text>
          ) : reviewAreas.length === 0 ? (
            <View className="w-full bg-white/40 border border-black/[0.03] rounded-[24px] p-6 items-center">
              <Target color="#D1D1D6" size={20} strokeWidth={1.5} />
              <Text className="text-[#1C1C1E] text-[15px] font-semibold mt-3">
                Current Progress
              </Text>
              <Text className="text-[#8E8E93] text-[13px] mt-1">
                Your learning trajectory will appear here.
              </Text>
            </View>
          ) : (
            <View className="flex-row gap-4">
              {reviewAreas.map(area => (
                <View key={area.id} className="flex-1 bg-white rounded-[24px] p-5 shadow-sm shadow-black/5 border border-white/50">
                  <View className={`w-12 h-12 rounded-2xl items-center justify-center mb-4 ${area.type === 'target' ? 'bg-red-50' : 'bg-indigo-50'}`}>
                    {area.type === 'target' ? (
                      <Target color="#ef4444" size={20} />
                    ) : (
                      <Activity color="#4f46e5" size={20} />
                    )}
                  </View>
                  <Text className="text-slate-800 font-bold text-[16px]">{area.title}</Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* Clean Activity/Search */}
        <Animated.View entering={FadeInUp.duration(800)} className="mb-8">
          <Text className="text-slate-800 text-[18px] font-bold tracking-tight mb-4">Recent Activity</Text>
          
          <View className="flex-row items-center bg-white rounded-2xl px-5 h-14 mb-6 shadow-sm shadow-black/5 border border-white/50">
            <Search color="#94A3B8" size={18} />
            <TextInput
              className="flex-1 ml-3 text-slate-800 text-[15px] font-medium"
              placeholder="Search journeys..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {filteredSheets.map((sheet, index) => (
            <Animated.View key={sheet.id} entering={FadeInUp.delay(100 * index)}>
              <SheetCard sheet={sheet} />
            </Animated.View>
          ))}

          {filteredSheets.length === 0 && (
            <View className="py-16 items-center justify-center bg-white/50 rounded-[32px] border border-black/[0.03]">
              <View className="mb-4">
                <PackageOpen color="#D1D1D6" size={28} strokeWidth={1} />
              </View>
              <Text className="text-[#1C1C1E] font-semibold text-[16px] mb-1">No results</Text>
              <Text className="text-[#8E8E93] text-[14px]">Refine your search parameters.</Text>
            </View>
          )}
        </Animated.View>

        {/* Extra padding to avoid content being hidden behind the absolute floating tab bar */}
        <View className="h-32" />
      </ScrollView>
    </SafeAreaView>
  );
}