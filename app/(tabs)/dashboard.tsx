import React from 'react';
import { View, Text, ScrollView, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { CheckCircle, Target, TrendingUp, Search, Flame, Sparkles, BookOpen, Activity, TrendingDown, Zap, Calendar, Award, PackageOpen } from 'lucide-react-native';
import { SheetCard } from '../../components/SheetCard';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

// Stable dummy data for the consistency heatmap
const HEATMAP_COLUMNS = [
  [0, 1, 2, 0, 0, 1, 3], // 4 weeks ago
  [1, 2, 3, 4, 2, 0, 1], // 3 weeks ago
  [0, 0, 1, 2, 3, 4, 2], // 2 weeks ago
  [2, 3, 4, 3, 2, 1, 0], // 1 week ago
  [1, 2, 3, 4, 4, 3, 4], // Current week (highly active)
];

const INTENSITY_COLORS: Record<number, string> = {
  0: 'bg-slate-100/80',
  1: 'bg-violet-200',
  2: 'bg-violet-300',
  3: 'bg-violet-500',
  4: 'bg-violet-600',
};

export default function DashboardScreen() {
  const user = useAppStore(state => state.user);
  const getStats = useAppStore(state => state.getStats);
  const sheets = useAppStore(state => state.sheets);
  const searchQuery = useAppStore(state => state.searchQuery);
  const setSearchQuery = useAppStore(state => state.setSearchQuery);

  const { totalSolved, totalQuestions, accuracy } = getStats();
  const progressPercentage = Math.round((totalSolved / Math.max(totalQuestions, 1)) * 100);
  
  const filteredSheets = sheets.filter(sheet =>
    sheet.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 bg-[#f8fafc]" showsVerticalScrollIndicator={false}>
        {/* Premium Hero Section */}
        <View className="bg-slate-900 pt-8 pb-32 px-6 rounded-b-[48px] overflow-hidden relative shadow-2xl shadow-slate-900/40 z-10">
          {/* Background Glow Effects */}
          <View className="absolute -top-32 -right-12 w-80 h-80 bg-violet-500/30 rounded-full blur-3xl" />
          <View className="absolute top-10 -left-20 w-72 h-72 bg-sky-500/20 rounded-full blur-3xl" />

          <View className="flex-row items-center justify-between mb-8 z-10">
            <View className="flex-1 mr-4">
              <Animated.View entering={FadeInDown.delay(100)} className="flex-row items-center mb-3">
                <View className="bg-amber-500/20 px-3 py-1.5 rounded-full flex-row items-center border border-amber-500/30 shadow-lg shadow-amber-500/20">
                  <Flame color="#fbbf24" size={14} />
                  <Text className="text-amber-400 text-[11px] font-black uppercase tracking-widest ml-1.5">14 Day Streak!</Text>
                </View>
              </Animated.View>
              <Text className="text-white text-[32px] font-black tracking-tight mb-1">Welcome back, {user.name}</Text>
              <Text className="text-slate-400 text-[15px] font-medium leading-relaxed">Consistency is the key to mastery. Let's crush your goals today.</Text>
            </View>

            {/* Circular Progress Avatar Visual */}
            <Animated.View entering={FadeInDown.delay(200)} className="relative justify-center items-center w-[76px] h-[76px]">
              {/* Pure CSS Circular Progress */}
              <View className="absolute w-full h-full rounded-full border-[4px] border-slate-800/80" />
              <View className="absolute w-full h-full rounded-full border-[4px] border-violet-500 border-t-transparent border-l-transparent rotate-12" />
              <Image
                source={{ uri: user.avatarUrl || 'https://ui-avatars.com/api/?name=User&background=6366f1&color=fff' }}
                className="w-16 h-16 rounded-full border-[3px] border-slate-900"
              />
              <View className="absolute -bottom-1 bg-violet-600 px-2 py-0.5 rounded-full border border-slate-900">
                <Text className="text-white text-[9px] font-black uppercase tracking-wider">Lvl 8</Text>
              </View>
            </Animated.View>
          </View>

          {/* Overall Progress Mini Card */}
          <Animated.View entering={FadeInUp.delay(300).springify()} className="bg-white/10 p-6 rounded-[32px] border border-white/10 backdrop-blur-xl z-10 shadow-2xl shadow-black/20">
            <View className="flex-row justify-between items-center mb-5">
              <View>
                <Text className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-1">Global Mastery</Text>
                <View className="flex-row items-baseline">
                  <Text className="text-white text-[32px] font-black tracking-tight">{totalSolved}</Text>
                  <Text className="text-slate-400 text-[15px] font-bold ml-1.5 tracking-tight">/ {totalQuestions} Solved</Text>
                </View>
              </View>
              <View className="bg-emerald-500/20 px-4 py-2 rounded-2xl border border-emerald-500/30 flex-row items-center">
                <Award color="#34d399" size={16} className="mr-1.5" />
                <Text className="text-emerald-400 text-[13px] font-black tracking-wider">{progressPercentage}%</Text>
              </View>
            </View>

            {/* Modern Progress Bar */}
            <View className="h-3 w-full bg-slate-800/80 rounded-full overflow-hidden shadow-inner">
              <View className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full bg-violet-500" style={{ width: `${progressPercentage}%` }} />
            </View>
          </Animated.View>
        </View>

        {/* Overlapping Floating Content */}
        <View className="-mt-12 px-6 z-20">
          
          {/* Analytical Topic Cards */}
          <View className="flex-row gap-4 mb-8">
            <Animated.View entering={FadeInUp.delay(400).springify()} className="flex-1 bg-white p-5 rounded-[28px] border border-emerald-100/60 shadow-xl shadow-slate-200/40 relative overflow-hidden">
              <View className="absolute -right-6 -top-6 w-20 h-20 bg-emerald-50 rounded-full blur-2xl" />
              <View className="bg-emerald-50 self-start p-2.5 rounded-xl mb-4 border border-emerald-100/50">
                <TrendingUp color="#059669" size={20} />
              </View>
              <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Strongest</Text>
              <Text className="text-slate-800 font-black text-lg tracking-tight">Arrays</Text>
              <Text className="text-emerald-600 font-bold text-xs mt-1.5">92% Accuracy</Text>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(500).springify()} className="flex-1 bg-white p-5 rounded-[28px] border border-rose-100/60 shadow-xl shadow-slate-200/40 relative overflow-hidden">
              <View className="absolute -right-6 -top-6 w-20 h-20 bg-rose-50 rounded-full blur-2xl" />
              <View className="bg-rose-50 self-start p-2.5 rounded-xl mb-4 border border-rose-100/50">
                <TrendingDown color="#e11d48" size={20} />
              </View>
              <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Needs Work</Text>
              <Text className="text-slate-800 font-black text-lg tracking-tight">Graphs</Text>
              <Text className="text-rose-600 font-bold text-xs mt-1.5">45% Accuracy</Text>
            </Animated.View>
          </View>

          {/* Consistency Heatmap */}
          <Animated.View entering={FadeInUp.delay(600).springify()} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/40 mb-8">
            <View className="flex-row justify-between items-center mb-6">
              <View className="flex-row items-center">
                <View className="bg-violet-50 p-2 rounded-xl mr-3 border border-violet-100/50">
                  <Calendar color="#7c3aed" size={18} />
                </View>
                <Text className="text-slate-800 text-[19px] font-black tracking-tight">Consistency</Text>
              </View>
              <View className="bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100/50">
                <Text className="text-emerald-700 font-black text-[10px] uppercase tracking-widest">Active</Text>
              </View>
            </View>
            
            <View className="flex-row justify-between mb-2">
              {HEATMAP_COLUMNS.map((col, colIndex) => (
                <View key={`col-${colIndex}`} className="gap-2">
                  {col.map((intensity, rowIndex) => (
                    <View 
                      key={`cell-${colIndex}-${rowIndex}`} 
                      className={`w-[34px] h-[34px] rounded-xl ${INTENSITY_COLORS[intensity]}`} 
                    />
                  ))}
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Search Journeys */}
          <Animated.View entering={FadeInUp.delay(700).springify()} className="flex-row items-center bg-white rounded-full px-6 py-4 mb-8 shadow-xl shadow-slate-200/30 border border-slate-100">
            <Search color="#94a3b8" size={22} />
            <TextInput
              className="flex-1 ml-3 text-slate-900 text-base font-medium"
              placeholder="Search your active journeys..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </Animated.View>

          <View className="flex-row items-center justify-between mb-5 px-1">
            <View className="flex-row items-center">
              <View className="bg-violet-100 p-2 rounded-xl mr-3">
                <BookOpen color="#7c3aed" size={18} />
              </View>
              <Text className="text-slate-800 text-[22px] font-black tracking-tight">Jump Back In</Text>
            </View>
          </View>
          
          {filteredSheets.map((sheet, index) => (
            <Animated.View key={sheet.id} entering={FadeInUp.delay(800 + index * 100).springify()}>
              <SheetCard sheet={sheet} />
            </Animated.View>
          ))}

          {filteredSheets.length === 0 && (
            <Animated.View entering={FadeInUp.delay(400)} className="py-12 mt-4 items-center justify-center bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/30">
              <View className="bg-slate-50 p-4 rounded-full mb-4">
                <PackageOpen color="#94a3b8" size={32} />
              </View>
              <Text className="text-slate-800 font-bold text-lg mb-1 tracking-tight">Nothing here yet</Text>
              <Text className="text-slate-400 font-medium text-sm">We couldn't find any matching journeys.</Text>
            </Animated.View>
          )}
          
          <View className="h-12" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}