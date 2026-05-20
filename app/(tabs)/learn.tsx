import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Database, Monitor, Network, Settings, Layers, ChevronLeft, ChevronRight, Lock, GitBranch, Zap, Search, Clock, PlayCircle, Heart, Star, ListMusic } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { useBookmarkStore } from '../../store/useBookmarkStore';
import Animated, { FadeInDown, FadeInRight, FadeIn } from 'react-native-reanimated';
import { placards as allPlacards } from '../../lib/dummyData';
import { Placard } from '../../types';

const DOMAINS = [
  { id: 'dsa', title: 'DSA', icon: Layers, color: '#7c3aed', bg: '#ede9fe', ready: true },
  { id: 'sys', title: 'System Design', icon: Settings, color: '#0284c7', bg: '#e0f2fe', ready: false },
  { id: 'os', title: 'Operating Systems', icon: Monitor, color: '#059669', bg: '#d1fae5', ready: false },
  { id: 'cn', title: 'Computer Networks', icon: Network, color: '#ea580c', bg: '#ffedd5', ready: false },
  { id: 'dbms', title: 'DBMS', icon: Database, color: '#4f46e5', bg: '#e0e7ff', ready: false },
  { id: 'oop', title: 'OOP', icon: BookOpen, color: '#db2777', bg: '#fce7f3', ready: false },
];

const TOPICS = [
  { id: 'arrays', title: 'Arrays', icon: Layers, color: '#3b82f6', bg: '#eff6ff', count: 45 },
  { id: 'graphs', title: 'Graphs', icon: Network, color: '#ec4899', bg: '#fdf2f8', count: 24 },
  { id: 'trees', title: 'Trees', icon: GitBranch, color: '#10b981', bg: '#ecfdf5', count: 32 },
  { id: 'dp', title: 'Dynamic Prog.', icon: Zap, color: '#f59e0b', bg: '#fffbeb', count: 38 },
  { id: 'binary-search', title: 'Binary Search', icon: Search, color: '#8b5cf6', bg: '#f5f3ff', count: 18 },
];

export default function LearnScreen() {
  const router = useRouter();
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const sheets = useAppStore(state => state.sheets);
  const setSelectedSheetId = useAppStore(state => state.setSelectedSheetId);
  const user = useAppStore(state => state.user);

  const bookmarkedIds = useBookmarkStore(state => state.bookmarkedIds);
  const setActiveBookmark = useBookmarkStore(state => state.setActiveBookmark);
  const playlists = useBookmarkStore(state => state.playlists);
  const setActivePlaylistId = useBookmarkStore(state => state.setActivePlaylistId);
  const recentlyViewedIds = useBookmarkStore(state => state.recentlyViewedIds);
  
  const recentlyViewedPlacards = React.useMemo(() => {
    return recentlyViewedIds.map(id => allPlacards.find(p => p.id === id)).filter(Boolean) as Placard[];
  }, [recentlyViewedIds]);

  const handleNavigation = (sheetId: string) => {
    setActivePlaylistId(null);
    setSelectedSheetId(sheetId);
    router.push('/reels');
  };


  const renderDomains = () => (
    <Animated.View entering={FadeIn.duration(300)}>
      {/* Premium Hero Section */}
      <View className="bg-white rounded-b-[48px] px-6 pt-6 pb-10 shadow-sm shadow-slate-200/50 mb-8 relative overflow-hidden z-10">
        {/* Soft Background Blurs */}
        <View className="absolute -top-12 -right-12 w-64 h-64 bg-violet-100/60 rounded-full blur-3xl" />
        <View className="absolute -bottom-16 -left-16 w-56 h-56 bg-emerald-50/60 rounded-full blur-3xl" />
        
        <Text className="text-violet-600 font-bold uppercase tracking-widest text-[11px] mb-2">Educational Library</Text>
        <Text className="text-slate-900 text-3xl font-black tracking-tight mb-1.5">Hello, {user?.name || 'Student'} 👋</Text>
        <Text className="text-slate-500 text-base font-medium">What would you like to master today?</Text>
      </View>
      
      <View className="px-6 z-20">
        <View className="flex-row items-center justify-between mb-5">
          <Text className="text-slate-800 text-xl font-bold tracking-tight">Explore Domains</Text>
        </View>

        <View className="flex-row flex-wrap justify-between">
          {DOMAINS.map((domain, index) => (
            <Animated.View key={domain.id} entering={FadeInDown.delay(index * 100).springify()} className="w-[48%] mb-5">
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => domain.ready ? setActiveDomain(domain.id) : null}
                className={`bg-white rounded-[32px] p-5 border border-slate-100 shadow-xl shadow-slate-200/30 ${!domain.ready ? 'opacity-75' : ''}`}
                style={{ minHeight: 160 }}
              >
                <View className="flex-row justify-between items-start mb-4">
                  <View className="p-3.5 rounded-2xl shadow-sm" style={{ backgroundColor: domain.bg, shadowColor: domain.color }}>
                    <domain.icon color={domain.color} size={24} />
                  </View>
                  {!domain.ready && (
                    <View className="bg-slate-50 p-2 rounded-full border border-slate-100">
                      <Lock color="#94a3b8" size={14} />
                    </View>
                  )}
                </View>
                <View className="mt-auto">
                  <Text className="text-slate-900 text-lg font-black mb-1 leading-tight tracking-tight">{domain.title}</Text>
                  {domain.ready ? (
                    <Text className="text-violet-600 text-[11px] font-bold uppercase tracking-wider">Start Learning</Text>
                  ) : (
                    <Text className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Coming Soon</Text>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      </View>
    </Animated.View>
  );

  const renderDSA = () => (
    <Animated.View entering={FadeInRight.duration(300)}>
      {/* DSA Specific Hero Area */}
      <View className="bg-white rounded-b-[48px] px-6 pt-6 pb-8 shadow-sm shadow-slate-200/50 mb-8 relative overflow-hidden flex-row items-center z-10">
        <View className="absolute -top-16 -right-16 w-64 h-64 bg-fuchsia-100/50 rounded-full blur-3xl" />
        
        <TouchableOpacity 
          onPress={() => setActiveDomain(null)}
          className="bg-slate-50 p-3.5 rounded-full mr-4 border border-slate-100 shadow-sm shadow-slate-100"
        >
          <ChevronLeft color="#334155" size={24} />
        </TouchableOpacity>
        <View>
          <Text className="text-violet-600 font-bold uppercase tracking-widest text-[11px] mb-1">Active Library</Text>
          <Text className="text-slate-900 text-3xl font-black tracking-tight">DSA Mastery</Text>
        </View>
      </View>

      <View className="z-20 mb-10">
        <View className="flex-row items-center justify-between mb-4 px-6">
          <Text className="text-slate-800 text-2xl font-black tracking-tight">Quick Revision</Text>
          {bookmarkedPlacards.length > 0 && (
            <View className="bg-fuchsia-100 px-3 py-1.5 rounded-full flex-row items-center">
              <Bookmark color="#c026d3" size={12} fill="#c026d3" className="mr-1.5" />
              <Text className="text-fuchsia-700 font-bold text-[11px] uppercase tracking-wider">{bookmarkedPlacards.length} Saved</Text>
            </View>
          )}
        </View>

        {bookmarkedPlacards.length === 0 ? (
          <View className="px-6">
            <View className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-xl shadow-slate-200/30 items-center justify-center border-dashed">
              <View className="bg-violet-50 p-4 rounded-full mb-3">
                <Bookmark color="#7c3aed" size={28} />
              </View>
              <Text className="text-slate-800 font-black text-lg mb-1 tracking-tight">No Bookmarks Yet</Text>
              <Text className="text-slate-500 text-center text-sm font-medium px-4">Save important patterns and your toughest questions for quick access here.</Text>
            </View>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-6 pt-2 pb-6 -mx-0">
            <View className="flex-row gap-4 pr-12">
              {bookmarkedPlacards.map((placard, index) => (
                <Animated.View key={placard.id} entering={FadeInRight.delay(index * 100).springify()}>
                  <TouchableOpacity 
                    activeOpacity={0.9}
                    onPress={() => handleBookmarkNavigation(placard)}
                    className="bg-white w-[260px] rounded-[28px] p-5 border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden"
                  >
                    <View className="absolute -right-8 -bottom-8 w-24 h-24 bg-fuchsia-100/50 rounded-full blur-2xl" />
                    
                    <View className="flex-row items-center mb-3 bg-fuchsia-50 self-start px-2.5 py-1 rounded-lg border border-fuchsia-100/50">
                      <Star color="#c026d3" size={10} fill="#c026d3" className="mr-1.5" />
                      <Text className="text-fuchsia-700 font-black text-[9px] uppercase tracking-widest">{placard.topic}</Text>
                    </View>
                    
                    <Text className="text-slate-900 text-lg font-black mb-1.5 tracking-tight leading-tight" numberOfLines={2}>{placard.title}</Text>
                    
                    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-100">
                      <Text className={`font-black text-[10px] uppercase tracking-widest ${
                        placard.difficulty === 'Easy' ? 'text-emerald-600' : 
                        placard.difficulty === 'Medium' ? 'text-amber-600' : 'text-rose-600'
                      }`}>{placard.difficulty}</Text>
                      
                      {placard.isCompleted ? (
                        <View className="bg-emerald-50 px-2 py-1 rounded-md">
                          <Text className="text-emerald-700 font-bold text-[9px] uppercase tracking-wider">Solved</Text>
                        </View>
                      ) : (
                        <View className="bg-slate-50 px-2 py-1 rounded-md">
                          <Text className="text-slate-500 font-bold text-[9px] uppercase tracking-wider">Pending</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <View className="z-20 mb-10">
        <View className="flex-row items-center justify-between mb-4 px-6">
          <Text className="text-slate-800 text-2xl font-black tracking-tight">Featured Journeys</Text>
          <TouchableOpacity activeOpacity={0.7} className="bg-violet-100 px-3 py-1.5 rounded-full">
            <Text className="text-violet-700 font-bold text-[11px] uppercase tracking-wider">{sheets.length} Sheets</Text>
          </TouchableOpacity>
        </View>

        {/* Premium Netflix Style Horizontal Row for Sheets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-6 pt-2 pb-6 -mx-0">
          <View className="flex-row gap-5 pr-12">
            {sheets.map((sheet, index) => {
              const progressPercentage = Math.round((sheet.completedQuestions / Math.max(sheet.totalQuestions, 1)) * 100);
              const estimatedHours = Math.round(sheet.totalQuestions * 0.4);

              return (
                <Animated.View key={sheet.id} entering={FadeInRight.delay(index * 100).springify()}>
                  <TouchableOpacity 
                    activeOpacity={0.9}
                    onPress={() => handleNavigation(sheet.id)}
                    className="bg-white w-[280px] rounded-[32px] p-6 border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden flex-col"
                    style={{ minHeight: 240 }}
                  >
                    {/* Subtle Internal Glow */}
                    <View className="absolute -right-10 -bottom-10 w-32 h-32 bg-violet-100/60 rounded-full blur-2xl" />

                    <View className="flex-row justify-between items-start mb-5">
                      <View className="bg-violet-50 p-3 rounded-2xl border border-violet-100/50 shadow-sm shadow-violet-100">
                        <BookOpen color="#7c3aed" size={24} />
                      </View>
                      <View className="bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-lg flex-row items-center">
                        <Clock color="#64748b" size={12} className="mr-1.5" />
                        <Text className="text-slate-500 font-bold text-[10px]">{estimatedHours}h est.</Text>
                      </View>
                    </View>

                    <View className="mb-5">
                      <Text className="text-slate-900 text-xl font-black mb-1.5 tracking-tight leading-tight">{sheet.title}</Text>
                      <Text className="text-slate-500 text-[13px] font-medium leading-relaxed" numberOfLines={2}>{sheet.description}</Text>
                    </View>

                    <View className="mt-auto">
                      <View className="flex-row justify-between items-center mb-2.5">
                        <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Mastery</Text>
                        <Text className="text-slate-600 text-[11px] font-bold">{progressPercentage}%</Text>
                      </View>
                      <View className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                        <View className="h-full bg-violet-500 rounded-full" style={{ width: `${progressPercentage}%` }} />
                      </View>
                      
                      <View className="flex-row items-center justify-between pt-4 border-t border-slate-100/80">
                        <Text className="text-slate-400 text-xs font-bold tracking-tight">{sheet.completedQuestions} / {sheet.totalQuestions} Solved</Text>
                        <View className="bg-violet-600 p-2.5 rounded-full shadow-md shadow-violet-300">
                          <PlayCircle color="#ffffff" size={18} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )
            })}
          </View>
        </ScrollView>
      </View>

      <View className="px-6 z-20">
        <Text className="text-slate-800 text-2xl font-black tracking-tight mb-5">Browse Topics</Text>
        
        <View className="flex-row flex-wrap justify-between mb-8">
          {TOPICS.map((topic, index) => (
            <Animated.View key={topic.id} entering={FadeInDown.delay(index * 100).springify()} className="w-[48%] mb-4">
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => handleNavigation(sheets[0]?.id || 'neetcode-150')} // Defaults to first sheet contextually for topics right now
                className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-lg shadow-slate-200/30 flex-col items-start relative overflow-hidden"
              >
                {/* Subtle Gradient Hint inside Category */}
                <View className="absolute -right-4 -top-4 w-20 h-20 rounded-full blur-2xl opacity-60" style={{ backgroundColor: topic.bg }} />

                <View className="p-3.5 rounded-2xl mb-4 border border-white/50 shadow-sm" style={{ backgroundColor: topic.bg, shadowColor: topic.color }}>
                  <topic.icon color={topic.color} size={22} />
                </View>
                
                <Text className="text-slate-900 text-[15px] font-black mb-1.5 tracking-tight">{topic.title}</Text>
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{topic.count} Questions</Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      </View>
      <View className="h-10" />
    </Animated.View>
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 bg-slate-50" showsVerticalScrollIndicator={false}>
        {activeDomain === 'dsa' ? renderDSA() : renderDomains()}
      </ScrollView>
    </SafeAreaView>
  );
}