import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useAppStore } from '../../store/useAppStore';
import { useBookmarkStore } from '../../store/useBookmarkStore';
import { PlacardCard } from '../../components/PlacardCard';
import { X, Lightbulb, CheckCircle2, AlertTriangle, Code2, Sparkles, ArrowRight, ArrowLeft, BookOpen, Clock, Database, Heart, ListMusic, Plus } from 'lucide-react-native';
import { Placard } from '../../types';
import { SheetSelector } from '../../components/SheetSelector';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, FadeInRight, FadeIn } from 'react-native-reanimated';
import { placards as allPlacards } from '../../lib/dummyData';

export default function ReelsScreen() {
  // Strict state isolation with Zustand selectors to prevent infinite re-renders
  const getPlacardsBySheet = useAppStore(state => state.getPlacardsBySheet);
  const selectedSheetId = useAppStore(state => state.selectedSheetId);
  const activeBookmarkId = useBookmarkStore(state => state.activeBookmarkId);
  const setActiveBookmark = useBookmarkStore(state => state.setActiveBookmark);
  const bookmarkedIds = useBookmarkStore(state => state.bookmarkedIds);
  const toggleBookmark = useBookmarkStore(state => state.toggleBookmark);
  const activePlaylistId = useBookmarkStore(state => state.activePlaylistId);
  const setActivePlaylistId = useBookmarkStore(state => state.setActivePlaylistId);
  const playlists = useBookmarkStore(state => state.playlists);
  const createPlaylist = useBookmarkStore(state => state.createPlaylist);
  const togglePlaylist = useBookmarkStore(state => state.togglePlaylist);
  const addRecentlyViewed = useBookmarkStore(state => state.addRecentlyViewed);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [playlistModalPlacardId, setPlaylistModalPlacardId] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const placards = useMemo(() => {
    if (activePlaylistId === 'favorites') return allPlacards.filter(p => bookmarkedIds.includes(p.id));
    if (activePlaylistId) {
      const pl = playlists.find(p => p.id === activePlaylistId);
      return allPlacards.filter(p => pl?.placardIds.includes(p.id));
    }
    return getPlacardsBySheet(selectedSheetId);
  }, [selectedSheetId, activePlaylistId, bookmarkedIds, playlists, getPlacardsBySheet]);
  
  const [selectedPlacard, setSelectedPlacard] = useState<Placard | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  const handleActionPress = useCallback((placard: Placard) => {
    setSelectedPlacard(placard);
    setActiveStep(0);
  }, []);

  const pagerRef = useRef<PagerView>(null);

  useEffect(() => {
    if (activeBookmarkId && placards.length > 0) {
      const index = placards.findIndex(p => p.id === activeBookmarkId);
      if (index >= 0) {
        setTimeout(() => {
          pagerRef.current?.setPageWithoutAnimation(index);
        }, 50);
      }
    }
  }, [activeBookmarkId, placards]);

  const handleBookmarkPress = useCallback((placardId: string) => {
    if (bookmarkedIds.includes(placardId)) {
      setPlaylistModalPlacardId(placardId);
    } else {
      toggleBookmark(placardId);
      setToastMessage('Saved to Favorites ❤️');
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [bookmarkedIds, toggleBookmark]);

  const CustomHeader = () => (
    <View className="flex-row items-center justify-between bg-white/95 px-5 py-3 rounded-full border border-slate-200 shadow-lg shadow-slate-300/30 backdrop-blur-md min-w-[140px] max-w-[220px]">
      <Text className="text-slate-900 font-black text-[15px] tracking-wide truncate" numberOfLines={1}>
        {activePlaylistId === 'favorites' ? 'Favorites' : playlists.find(p => p.id === activePlaylistId)?.name || 'Playlist'}
      </Text>
      <TouchableOpacity activeOpacity={0.7} onPress={() => setActivePlaylistId(null)} className="ml-3 bg-slate-100 rounded-full p-1 active:scale-90 transition-transform">
        <X size={16} color="#64748b" />
      </TouchableOpacity>
    </View>
  );

  if (!placards.length) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="absolute z-50 top-0 left-0 right-0 pt-4 pb-4 px-4 bg-white/80 backdrop-blur-xl flex-row justify-center">
          {activePlaylistId ? <CustomHeader /> : <SheetSelector />}
        </View>
        <Animated.View entering={FadeInUp.duration(600).springify()} className="flex-1 items-center justify-center p-8 bg-slate-50/50">
          <View className="w-28 h-28 bg-violet-50 rounded-[32px] items-center justify-center mb-8 shadow-2xl shadow-violet-200/50 border border-violet-100/60 rotate-3">
            {activePlaylistId ? <ListMusic color="#7c3aed" size={44} strokeWidth={1.5} /> : <BookOpen color="#7c3aed" size={44} strokeWidth={1.5} />}
          </View>
          <Text className="text-slate-900 text-[28px] font-black mb-3 text-center tracking-tight">{activePlaylistId ? 'Playlist is Empty' : 'Your Journey Awaits'}</Text>
          <Text className="text-slate-500 text-center text-[17px] leading-relaxed font-medium mb-10 max-w-[280px]">
            {activePlaylistId ? 'Save important patterns here to review them later.' : 'Select a curated mastery sheet from the top menu to begin your interactive revision.'}
          </Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc]">
      {toastMessage && (
        <Animated.View entering={FadeInUp.springify()} exiting={FadeInUp.reverse()} className="absolute top-20 self-center bg-slate-900/95 backdrop-blur-md px-6 py-3.5 rounded-full shadow-2xl flex-row items-center z-[100] border border-white/10">
          <Heart color="#f43f5e" size={18} fill="#f43f5e" className="mr-2.5" />
          <Text className="text-white font-bold tracking-wide">{toastMessage}</Text>
        </Animated.View>
      )}

      <View className="absolute z-50 top-0 left-0 right-0 pt-4 pb-4 px-4 bg-white/70 backdrop-blur-2xl border-b border-white/20 flex-row justify-center">
        {activePlaylistId ? <CustomHeader /> : <SheetSelector />}
      </View>
      
      <PagerView 
        ref={pagerRef} 
        style={{ flex: 1 }} 
        initialPage={0} 
        orientation="vertical"
        onPageSelected={(e) => {
          const idx = e.nativeEvent.position;
          if (placards[idx]) addRecentlyViewed(placards[idx].id);
        }}
      >
        {placards.map((placard, index) => (
          <View key={placard.id} style={{ flex: 1 }}>
            <PlacardCard 
              placard={placard} 
              onActionPress={() => handleActionPress(placard)} 
              onBookmarkPress={() => handleBookmarkPress(placard.id)}
              onBookmarkLongPress={() => setPlaylistModalPlacardId(placard.id)}
              index={index}
              total={placards.length}
            />
          </View>
        ))}
      </PagerView>

      <Modal visible={!!selectedPlacard} animationType="slide" transparent={true} onRequestClose={() => setSelectedPlacard(null)}>
        <View className="flex-1 justify-end bg-slate-900/50 backdrop-blur-sm">
          <View className="h-[92%] bg-white rounded-t-[44px] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] overflow-hidden border-t border-white flex-col">
            <View className="w-14 h-1.5 bg-slate-200/80 rounded-full mx-auto mt-4 mb-5" />
            
            {/* Step Indicators */}
            <View className="px-8 mb-6">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-slate-500 font-bold text-[13px] uppercase tracking-widest">
                  {activeStep === 0 ? 'Step 1: Understand' : activeStep === 1 ? 'Step 2: Execute' : 'Step 3: Review'}
                </Text>
                <Text className="text-violet-600 font-bold text-[13px]">{activeStep + 1} of 3</Text>
              </View>
              <View className="flex-row gap-2">
                {[0, 1, 2].map(step => (
                  <View key={step} className={`h-2 flex-1 rounded-full transition-colors duration-300 ${activeStep >= step ? 'bg-violet-500' : 'bg-slate-100'}`} />
                ))}
              </View>
            </View>

            <View className="flex-row justify-between items-center px-8 pb-5 border-b border-slate-100/80">
              <Text className="text-slate-900 text-[28px] font-black flex-1 mr-4 tracking-tight leading-tight" numberOfLines={2}>{selectedPlacard?.title}</Text>
              
              <View className="flex-row gap-3">
                <TouchableOpacity 
                  activeOpacity={0.7} 
                  onPress={() => { if (selectedPlacard) handleBookmarkPress(selectedPlacard.id); }}
                  onLongPress={() => { if (selectedPlacard) setPlaylistModalPlacardId(selectedPlacard.id); }}
                  className="bg-white p-3.5 rounded-full border border-slate-200/60 shadow-sm shadow-slate-100"
                >
                  <Heart 
                    color={selectedPlacard && bookmarkedIds.includes(selectedPlacard.id) ? "#e11d48" : "#94a3b8"} 
                    fill={selectedPlacard && bookmarkedIds.includes(selectedPlacard.id) ? "#e11d48" : "transparent"} 
                    size={22}
                  />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedPlacard(null)} className="bg-slate-50 p-3.5 rounded-full border border-slate-200/60 shadow-sm shadow-slate-100">
                  <X color="#64748b" size={22} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView className="flex-1 px-8 pt-8" showsVerticalScrollIndicator={false}>
              {activeStep === 0 && (
                <Animated.View key="step0" entering={FadeInRight.duration(300)} className="pb-12">
                  <Text className="text-slate-800 text-[20px] leading-relaxed font-medium mb-8">
                    {selectedPlacard?.questionText}
                  </Text>
                  
                  <View className="bg-amber-50/80 border border-amber-200/50 rounded-[32px] p-7 shadow-lg shadow-amber-100/30">
                    <View className="flex-row items-center mb-4">
                      <View className="bg-amber-100 p-2.5 rounded-2xl mr-3 shadow-sm shadow-amber-200/50">
                        <Sparkles color="#d97706" size={22} />
                      </View>
                      <Text className="text-amber-900 font-black text-xl tracking-tight">Key Insight</Text>
                    </View>
                    <Text className="text-amber-800/90 text-[17px] leading-relaxed font-medium">
                      Focus on breaking down the problem into smaller overlapping subproblems. Look for patterns in the examples to establish a base condition.
                    </Text>
                  </View>
                </Animated.View>
              )}
              
              {activeStep === 1 && (
                <Animated.View key="step1" entering={FadeInRight.duration(300)} className="pb-12">
                  {selectedPlacard?.codeSnippet ? (
                    <View className="bg-white rounded-[32px] border border-slate-200/80 shadow-xl shadow-slate-200/30 mb-8 overflow-hidden">
                      <View className="bg-slate-50/80 border-b border-slate-100 px-5 py-3.5 flex-row items-center justify-between">
                        <View className="flex-row items-center gap-1.5">
                          <View className="w-3 h-3 rounded-full bg-rose-400" />
                          <View className="w-3 h-3 rounded-full bg-amber-400" />
                          <View className="w-3 h-3 rounded-full bg-emerald-400" />
                        </View>
                        <Text className="text-slate-400 font-mono text-[11px] font-bold tracking-widest uppercase">Solution Walkthrough</Text>
                      </View>
                      <View className="p-6 bg-slate-50/30">
                        <Text className="text-slate-700 font-mono text-[15px] leading-[1.8] tracking-tight">
                          {selectedPlacard.codeSnippet}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text className="text-slate-500 italic mb-8">No code snippet available.</Text>
                  )}

                  <View className="flex-row gap-4 mb-8">
                    <View className="flex-1 bg-sky-50/80 border border-sky-100/80 rounded-[28px] p-5 shadow-sm shadow-sky-100/50">
                      <View className="bg-sky-100/80 self-start p-2.5 rounded-xl mb-3">
                        <Clock color="#0284c7" size={20} />
                      </View>
                      <Text className="text-sky-900 font-black text-lg mb-1 tracking-tight">O(N)</Text>
                      <Text className="text-sky-700 font-medium text-sm">Time Complexity</Text>
                    </View>
                    <View className="flex-1 bg-violet-50/80 border border-violet-100/80 rounded-[28px] p-5 shadow-sm shadow-violet-100/50">
                      <View className="bg-violet-100/80 self-start p-2.5 rounded-xl mb-3">
                        <Database color="#7c3aed" size={20} />
                      </View>
                      <Text className="text-violet-900 font-black text-lg mb-1 tracking-tight">O(N)</Text>
                      <Text className="text-violet-700 font-medium text-sm">Space Complexity</Text>
                    </View>
                  </View>

                  <View className="bg-emerald-50/80 border border-emerald-200/50 rounded-[32px] p-7 shadow-lg shadow-emerald-100/30">
                    <View className="flex-row items-center mb-4">
                      <View className="bg-emerald-100 p-2.5 rounded-2xl mr-3 shadow-sm shadow-emerald-200/50">
                        <CheckCircle2 color="#059669" size={22} />
                      </View>
                      <Text className="text-emerald-900 font-black text-xl tracking-tight">Why this works</Text>
                    </View>
                    <Text className="text-emerald-800/90 text-[17px] leading-relaxed font-medium">
                      This approach optimizes the time complexity by avoiding nested loops, utilizing additional space efficiently to keep track of previously seen elements.
                    </Text>
                  </View>
                </Animated.View>
              )}

              {activeStep === 2 && (
                <Animated.View key="step2" entering={FadeInRight.duration(300)} className="pb-12">
                  <View className="bg-rose-50/80 border border-rose-200/50 rounded-[32px] p-7 shadow-lg shadow-rose-100/30 mb-8">
                    <View className="flex-row items-center mb-4">
                      <View className="bg-rose-100 p-2.5 rounded-2xl mr-3 shadow-sm shadow-rose-200/50">
                        <AlertTriangle color="#e11d48" size={22} />
                      </View>
                      <Text className="text-rose-900 font-black text-xl tracking-tight">Common Pitfall</Text>
                    </View>
                    <Text className="text-rose-800/90 text-[17px] leading-relaxed font-medium">
                      Forgetting to handle edge cases like empty inputs or incorrectly initializing the base conditions. Always verify bounds before indexing.
                    </Text>
                  </View>

                  <View className="bg-slate-900 rounded-[32px] p-8 shadow-2xl shadow-slate-900/20 relative overflow-hidden">
                    <View className="absolute -right-8 -top-8 w-32 h-32 bg-violet-500/30 rounded-full blur-3xl" />
                    <View className="absolute -left-8 -bottom-8 w-32 h-32 bg-sky-500/30 rounded-full blur-3xl" />
                    
                    <View className="bg-white/10 self-start p-3 rounded-2xl mb-5 backdrop-blur-md border border-white/10">
                      <Lightbulb color="#fff" size={24} />
                    </View>
                    <Text className="text-white font-black text-2xl mb-3 tracking-tight">Mentorship Note</Text>
                    <Text className="text-slate-300 text-[17px] leading-relaxed font-medium">
                      Mastering this pattern unlocks a whole category of optimization problems. Take a moment to trace the code with a small example on paper to build intuition.
                    </Text>
                  </View>
                </Animated.View>
              )}
            </ScrollView>

            {/* Sticky Action Button */}
            <View className="pt-4 pb-10 px-8 border-t border-slate-100/80 bg-white/95 backdrop-blur-xl flex-row gap-4">
              {activeStep > 0 && (
                <TouchableOpacity 
                  activeOpacity={0.8}
                  onPress={() => setActiveStep(prev => prev - 1)}
                  className="bg-slate-50 w-16 h-16 rounded-[24px] items-center justify-center border border-slate-200 shadow-sm shadow-slate-100"
                >
                  <ArrowLeft color="#64748b" size={24} />
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                activeOpacity={0.85}
                onPress={() => {
                  if (activeStep < 2) setActiveStep(prev => prev + 1);
                  else setSelectedPlacard(null);
                }}
                className={`flex-1 flex-row items-center justify-center h-16 rounded-[24px] shadow-xl ${activeStep === 2 ? 'bg-emerald-500 shadow-emerald-200' : 'bg-slate-900 shadow-slate-900/20'}`}
              >
                <Text className="text-white text-[19px] font-black tracking-wide mr-3">
                  {activeStep === 2 ? 'Complete Review' : 'Next Step'}
                </Text>
                {activeStep < 2 ? <ArrowRight color="#fff" size={22} /> : <CheckCircle2 color="#fff" size={22} />}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* Bottom Sheet Playlist Modal */}
      <Modal visible={!!playlistModalPlacardId} animationType="fade" transparent>
        <View className="flex-1 justify-end bg-slate-900/60 backdrop-blur-sm">
          <Animated.View entering={FadeInDown.springify().damping(18)} className="bg-white rounded-t-[44px] p-8 pb-10 max-h-[85%]">
            <View className="w-14 h-1.5 bg-slate-200/80 rounded-full mx-auto mb-6" />
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-black text-slate-900 tracking-tight">Save to Playlist</Text>
              <TouchableOpacity onPress={() => setPlaylistModalPlacardId(null)} className="p-2.5 bg-slate-100 rounded-full active:scale-95 transition-transform">
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="mb-4">
              <TouchableOpacity activeOpacity={0.8} onPress={() => playlistModalPlacardId && toggleBookmark(playlistModalPlacardId)} className="flex-row items-center justify-between p-4 mb-3 rounded-2xl border border-slate-100 bg-slate-50">
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-xl mr-3.5 items-center justify-center shadow-sm bg-rose-100">
                    <Heart color="#e11d48" size={22} fill={bookmarkedIds.includes(playlistModalPlacardId!) ? "#e11d48" : "transparent"} />
                  </View>
                  <Text className="text-[17px] font-black tracking-tight text-slate-800">Favorites</Text>
                </View>
                <View className={`w-7 h-7 rounded-full border-2 items-center justify-center ${bookmarkedIds.includes(playlistModalPlacardId!) ? 'bg-rose-500 border-rose-500' : 'border-slate-200 bg-white'}`}>
                  {bookmarkedIds.includes(playlistModalPlacardId!) && <CheckCircle2 size={16} color="#fff" />}
                </View>
              </TouchableOpacity>

              {playlists.map(pl => (
                <TouchableOpacity key={pl.id} activeOpacity={0.8} onPress={() => playlistModalPlacardId && togglePlaylist(pl.id, playlistModalPlacardId)} className="flex-row items-center justify-between p-4 mb-3 rounded-2xl border border-slate-100 bg-slate-50">
                  <View className="flex-row items-center">
                    <View className="w-12 h-12 rounded-xl mr-3.5 items-center justify-center shadow-sm" style={{ backgroundColor: pl.color1 }}>
                      <ListMusic color="#fff" size={22} />
                    </View>
                    <Text className="text-[17px] font-black tracking-tight text-slate-800">{pl.name}</Text>
                  </View>
                  <View className={`w-7 h-7 rounded-full border-2 items-center justify-center ${pl.placardIds.includes(playlistModalPlacardId!) ? 'bg-violet-500 border-violet-500' : 'border-slate-200 bg-white'}`}>
                    {pl.placardIds.includes(playlistModalPlacardId!) && <CheckCircle2 size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View className="pt-4 border-t border-slate-100/80 flex-row items-center">
              <TextInput value={newPlaylistName} onChangeText={setNewPlaylistName} placeholder="New playlist name..." placeholderTextColor="#94a3b8" className="flex-1 bg-slate-50 border border-slate-200/80 rounded-2xl px-5 py-4 mr-3 font-bold text-slate-800 tracking-tight" />
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => { if (newPlaylistName.trim() && playlistModalPlacardId) { createPlaylist(newPlaylistName.trim(), playlistModalPlacardId); setNewPlaylistName(''); } }}
                className="bg-slate-900 px-6 py-4 rounded-2xl items-center justify-center shadow-lg shadow-slate-900/20"
              >
                <Text className="text-white font-black tracking-wide">Create</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
