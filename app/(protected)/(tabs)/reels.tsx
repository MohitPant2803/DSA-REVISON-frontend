import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useAppStore } from '../../../src/store/useAppStore';
import { useBookmarkStore } from '../../../src/store/useBookmarkStore';
import { X, Lightbulb, CheckCircle2, AlertTriangle, Sparkles, ArrowRight, ArrowLeft, BookOpen, Heart, ListMusic, ChevronDown } from 'lucide-react-native';
import { Placard } from '../../../src/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, FadeOutUp, FadeIn } from 'react-native-reanimated';

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
  const [allPlacards, setAllPlacards] = useState<Placard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPlacards = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/placards`);
        const data = await response.json();
        // Safely extract the array whether it's direct or nested under "data"
        const placardsArray = Array.isArray(data) ? data : (data?.data || []);
        setAllPlacards(placardsArray);
      } catch (error) {
        console.error("Error fetching placards:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPlacards();
  }, []);

  const placards = useMemo(() => {
    if (!Array.isArray(allPlacards)) return [];

    if (activePlaylistId === 'favorites') return allPlacards.filter(p => bookmarkedIds.includes(p.id));
    if (activePlaylistId) {
      const pl = playlists.find(p => p.id === activePlaylistId);
      return allPlacards.filter(p => pl?.placardIds.includes(p.id));
    }
    return getPlacardsBySheet(selectedSheetId);
  }, [selectedSheetId, activePlaylistId, bookmarkedIds, playlists, getPlacardsBySheet, allPlacards]);
  
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
      setToastMessage('Added to Favorites');
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [bookmarkedIds, toggleBookmark]);

  const NewSheetSelector = () => {
    const sheets = useAppStore(state => state.sheets);
    const selectedSheet = sheets.find(s => s.id === selectedSheetId);

    return (
      <TouchableOpacity activeOpacity={0.8} className="flex-row items-center justify-center bg-white/80 backdrop-blur-xl rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.04)] border border-black/[0.02] px-5 py-2.5">
        <Text className="text-[#1C1C1E] font-medium text-[15px] tracking-tight mr-1.5" numberOfLines={1}>
          {selectedSheet?.title || 'Select a Sheet'}
        </Text>
        <ChevronDown size={16} color="#8E8E93" strokeWidth={2.5} />
      </TouchableOpacity>
    );
  };

  const CustomHeader = () => (
    <View className="flex-row items-center justify-center bg-white/80 backdrop-blur-xl rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.04)] border border-black/[0.02]">
      <Text className="text-[#1C1C1E] font-medium text-[15px] tracking-tight px-5 py-2.5" numberOfLines={1}>
        {activePlaylistId === 'favorites' ? 'Favorites' : playlists.find(p => p.id === activePlaylistId)?.name || 'Playlist'}
      </Text>
      <TouchableOpacity activeOpacity={0.6} onPress={() => setActivePlaylistId(null)} className="border-l border-black/[0.04] pr-3 pl-2 py-2.5">
        <X size={16} color="#8E8E93" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-[#F2F2F7] items-center justify-center">
        <ActivityIndicator size="large" color="#1C1C1E" />
      </SafeAreaView>
    );
  }

  if (!placards.length) {
    const getEmptyContent = () => {
      if (activePlaylistId === 'favorites') {
        return { title: 'No Favorites', description: 'Items you bookmark will appear here for quick access.' };
      }
      if (activePlaylistId) {
        return { title: 'Empty Playlist', description: 'Add problems to this collection to start your review.' };
      }
      return { title: 'No Content Available', description: 'Select a curriculum to begin your interactive learning session.' };
    };

    const content = getEmptyContent();

    return (
      <SafeAreaView className="flex-1 bg-[#F2F2F7]">
        <View className="absolute z-50 top-0 left-0 right-0 pt-4 pb-4 px-4 bg-transparent flex-row justify-center">
          {activePlaylistId ? <CustomHeader /> : <NewSheetSelector />}
        </View>
        <Animated.View entering={FadeIn.duration(500)} className="flex-1 items-center justify-center p-8">
          <View className="w-20 h-20 bg-white/50 rounded-[30px] items-center justify-center mb-8 border border-black/[0.03]">
            {activePlaylistId ? <ListMusic color="#8E8E93" size={28} strokeWidth={1} /> : <BookOpen color="#8E8E93" size={28} strokeWidth={1} />}
          </View>
          <Text className="text-[#1C1C1E] text-[17px] font-semibold mb-2 text-center tracking-tight">{content.title}</Text>
          <Text className="text-[#8E8E93] text-center text-[15px] leading-relaxed max-w-[240px]">
            {content.description}
          </Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F2F2F7]">
      {toastMessage && (
        <Animated.View entering={FadeInUp.duration(400)} exiting={FadeOutUp.duration(300)} className="absolute top-20 self-center bg-[#2C2C2E]/95 backdrop-blur-xl px-5 py-3 rounded-full shadow-xl shadow-black/10 flex-row items-center z-[100]">
          <Heart color="#FF3B30" size={13} fill="#FF3B30" className="mr-2.5" />
          <Text className="text-white font-medium text-[14px] tracking-wide">{toastMessage}</Text>
        </Animated.View>
      )}

      <View className="absolute z-50 top-0 left-0 right-0 pt-4 pb-4 px-4 bg-transparent flex-row justify-center">
        {activePlaylistId ? <CustomHeader /> : <NewSheetSelector />}
      </View>
      
      <View className="flex-1">
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
            <View key={placard.id} className="flex-1 p-3 pb-[90px]">
              <Animated.View entering={FadeIn.duration(800)} className="flex-1 bg-[#FDFDFD] border border-black/[0.02] shadow-[0_12px_40px_rgba(0,0,0,0.06)] rounded-[36px] overflow-hidden flex-col">
                
                {/* Top Meta */}
                <View className="px-8 pt-8 flex-row justify-between items-start">
                  <Text className="text-[#8E8E93] font-medium text-[12px] uppercase tracking-[0.2em]">{placard.category}</Text>
                  <TouchableOpacity activeOpacity={0.6} onLongPress={() => setPlaylistModalPlacardId(placard.id)} onPress={() => handleBookmarkPress(placard.id)}>
                    <Heart size={28} color={bookmarkedIds.includes(placard.id) ? "#FF3B30" : "#D1D1D6"} fill={bookmarkedIds.includes(placard.id) ? "#FF3B30" : "transparent"} strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>

                {/* Centered Immersive Content */}
                <View className="flex-1 justify-center items-center px-8">
                  <Text className="text-[#1C1C1E] font-semibold text-[34px] text-center tracking-tight leading-[1.15]">{placard.title}</Text>
                  <Text className="text-[#8E8E93] text-[18px] text-center mt-6 leading-relaxed font-normal">{placard.questionText}</Text>
                </View>

                {/* Bottom Actions */}
                <View className="px-8 pb-8 gap-3">
                  <TouchableOpacity activeOpacity={0.8} onPress={() => handleActionPress(placard)} className="bg-[#5E5CE6] rounded-full w-full py-4 flex-row items-center justify-center shadow-[0_4px_16px_rgba(94,92,230,0.25)]">
                    <Text className="text-white font-medium text-[17px] mr-2">Begin Review</Text>
                    <ArrowRight size={18} color="white" strokeWidth={2.5} />
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.6} onPress={() => pagerRef.current?.setPage(index + 1)} className="bg-black/[0.03] rounded-full w-full py-4 flex-row items-center justify-center">
                    <Text className="text-[#1C1C1E] font-medium text-[17px]">Skip for now</Text>
                  </TouchableOpacity>
                </View>

              </Animated.View>
            </View>
          ))}
        </PagerView>
      </View>

      <Modal visible={!!selectedPlacard} animationType="slide" transparent={true} onRequestClose={() => setSelectedPlacard(null)}>
        <View className="flex-1 justify-end bg-black/20 backdrop-blur-2xl">
          <Animated.View entering={FadeInUp.duration(400)} className="h-[92%] bg-[#F2F2F7] rounded-t-[40px] overflow-hidden flex-col">
            {/* Modal Header */}
            <View className="flex-row justify-between items-center px-8 pt-8 pb-4">
              <View className="flex-1 mr-4">
                <Text className="text-[#8E8E93] font-medium text-[11px] uppercase tracking-[0.2em] mb-1">
                  {activeStep === 0 ? 'Understand' : activeStep === 1 ? 'Execute' : 'Review'}
                </Text>
                <Text className="text-[#1C1C1E] text-[26px] font-semibold tracking-tight leading-tight" numberOfLines={2}>{selectedPlacard?.title}</Text>
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="w-10 h-10 bg-white rounded-full items-center justify-center shadow-sm shadow-black/[0.02]"
                  onPress={() => { if (selectedPlacard) handleBookmarkPress(selectedPlacard.id); }}
                  onLongPress={() => { if (selectedPlacard) setPlaylistModalPlacardId(selectedPlacard.id); }}
                >
                  <Heart color={selectedPlacard && bookmarkedIds.includes(selectedPlacard.id) ? "#FF3B30" : "#8E8E93"} fill={selectedPlacard && bookmarkedIds.includes(selectedPlacard.id) ? "#FF3B30" : "transparent"} size={18} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity className="w-10 h-10 bg-white rounded-full items-center justify-center shadow-sm shadow-black/[0.02]" onPress={() => setSelectedPlacard(null)}>
                  <X color="#1C1C1E" size={18} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView className="flex-1 px-6 pt-2" showsVerticalScrollIndicator={false}>
              {activeStep === 0 && (
                <Animated.View key="step0" entering={FadeIn.duration(400)} className="pb-32">
                  <View className="bg-white rounded-[28px] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)] mb-4">
                    <Text className="text-[#1C1C1E] text-[17px] leading-relaxed font-normal">
                      {selectedPlacard?.questionText}
                    </Text>
                  </View>
                  <View className="bg-white rounded-[28px] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                    <View className="flex-row items-center mb-4">
                      <Sparkles color="#5E5CE6" size={20} strokeWidth={2} />
                      <Text className="text-[#1C1C1E] font-medium text-[16px] ml-3">Key Insight</Text>
                    </View>
                    <Text className="text-[#8E8E93] text-[16px] leading-relaxed">
                      Focus on breaking down the problem into smaller overlapping subproblems. Look for patterns in the examples to establish a base condition.
                    </Text>
                  </View>
                </Animated.View>
              )}
              
              {activeStep === 1 && (
                <Animated.View key="step1" entering={FadeIn.duration(400)} className="pb-32">
                  {selectedPlacard?.codeSnippet ? (
                    <View className="bg-[#1C1C1E] rounded-[28px] mb-4 overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
                      <View className="px-6 py-4 border-b border-white/10">
                        <Text className="text-[#8E8E93] font-mono text-[11px] uppercase tracking-[0.2em]">Solution Implementation</Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
                        <Text className="text-[#F2F2F7] font-mono text-[14px] leading-relaxed">
                          {selectedPlacard.codeSnippet}
                        </Text>
                      </ScrollView>
                    </View>
                  ) : (
                    <Text className="text-[#8E8E93] italic mb-4 px-2">No code snippet available.</Text>
                  )}

                  <View className="flex-row gap-4 mb-4">
                    <View className="flex-1 bg-white rounded-[24px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                      <Text className="text-[#8E8E93] text-[13px] font-medium mb-1">Time</Text>
                      <Text className="text-[#1C1C1E] font-semibold text-[20px]">O(N)</Text>
                    </View>
                    <View className="flex-1 bg-white rounded-[24px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                      <Text className="text-[#8E8E93] text-[13px] font-medium mb-1">Space</Text>
                      <Text className="text-[#1C1C1E] font-semibold text-[20px]">O(N)</Text>
                    </View>
                  </View>

                  <View className="bg-white rounded-[28px] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                    <View className="flex-row items-center mb-4">
                      <CheckCircle2 color="#34C759" size={20} strokeWidth={2} />
                      <Text className="text-[#1C1C1E] font-medium text-[16px] ml-3">Why this works</Text>
                    </View>
                    <Text className="text-[#8E8E93] text-[16px] leading-relaxed">
                      This approach optimizes the time complexity by avoiding nested loops, utilizing additional space efficiently to keep track of previously seen elements.
                    </Text>
                  </View>
                </Animated.View>
              )}

              {activeStep === 2 && (
                <Animated.View key="step2" entering={FadeIn.duration(400)} className="pb-32">
                  <View className="bg-white rounded-[28px] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)] mb-4">
                    <View className="flex-row items-center mb-4">
                      <AlertTriangle color="#FF9500" size={20} strokeWidth={2} />
                      <Text className="text-[#1C1C1E] font-medium text-[16px] ml-3">Common Pitfall</Text>
                    </View>
                    <Text className="text-[#8E8E93] text-[16px] leading-relaxed">
                      Forgetting to handle edge cases like empty inputs or incorrectly initializing the base conditions. Always verify bounds before indexing.
                    </Text>
                  </View>

                  <View className="bg-[#5E5CE6] rounded-[28px] p-8 shadow-[0_8px_24px_rgba(94,92,230,0.25)] relative overflow-hidden">
                    <View className="flex-row items-center mb-4">
                      <Lightbulb color="white" size={20} strokeWidth={2.5} />
                      <Text className="text-white font-medium text-[16px] ml-3">Mentorship Note</Text>
                    </View>
                    <Text className="text-white/90 text-[16px] leading-relaxed">
                      Mastering this pattern unlocks a whole category of optimization problems. Take a moment to trace the code with a small example on paper to build intuition.
                    </Text>
                  </View>
                </Animated.View>
              )}
            </ScrollView>

            {/* Translucent Action Bar */}
            <View className="absolute bottom-0 left-0 right-0 pt-4 pb-10 px-6 bg-[#F2F2F7]/90 backdrop-blur-xl flex-row gap-3 border-t border-black/[0.02]">
              {activeStep > 0 && (
                <TouchableOpacity className="w-14 h-14 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.04)] items-center justify-center" onPress={() => setActiveStep(prev => prev - 1)}>
                  <ArrowLeft color="#1C1C1E" size={20} strokeWidth={2.5} />
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                className="flex-1 h-14 bg-[#5E5CE6] rounded-full shadow-[0_4px_16px_rgba(94,92,230,0.25)] flex-row items-center justify-center"
                onPress={() => {
                  if (activeStep < 2) setActiveStep(prev => prev + 1);
                  else setSelectedPlacard(null);
                }}
              >
                <Text className="text-white font-medium text-[16px] mr-2">{activeStep === 2 ? 'Finish' : 'Next Step'}</Text>
                {activeStep < 2 ? <ArrowRight color="#fff" size={18} strokeWidth={2.5} /> : <CheckCircle2 color="#fff" size={18} strokeWidth={2.5} />}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Bottom Sheet Playlist Modal */}
      <Modal visible={!!playlistModalPlacardId} animationType="fade" transparent>
        <TouchableOpacity className="flex-1 justify-end bg-black/20 backdrop-blur-2xl" activeOpacity={1} onPress={() => setPlaylistModalPlacardId(null)}>
          <Animated.View entering={FadeInDown.duration(400)} className="max-h-[85%]" onStartShouldSetResponder={() => true}>
            <View className="bg-[#F2F2F7] rounded-t-[40px] px-8 pt-8 pb-10">
              <View className="flex-row justify-between items-center mb-8">
                <Text className="text-[24px] font-semibold text-[#1C1C1E] tracking-tight">Save to...</Text>
                <TouchableOpacity onPress={() => setPlaylistModalPlacardId(null)} className="w-10 h-10 bg-white rounded-full items-center justify-center shadow-sm shadow-black/[0.02]">
                  <X size={18} color="#1C1C1E" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} className="mb-6 -mx-2 px-2">
                <TouchableOpacity activeOpacity={0.8} onPress={() => playlistModalPlacardId && toggleBookmark(playlistModalPlacardId)} className="flex-row items-center justify-between p-4 mb-3 rounded-[24px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                  <View className="flex-row items-center">
                    <View className="w-12 h-12 rounded-[16px] mr-4 items-center justify-center bg-[#FF3B30]/10">
                      <Heart color="#FF3B30" size={22} fill="#FF3B30" />
                    </View>
                    <Text className="text-[17px] font-medium text-[#1C1C1E]">Favorites</Text>
                  </View>
                  {bookmarkedIds.includes(playlistModalPlacardId!) && <CheckCircle2 size={22} color="#FF3B30" strokeWidth={2.5} />}
                </TouchableOpacity>

                {playlists.map(pl => (
                  <TouchableOpacity key={pl.id} activeOpacity={0.8} onPress={() => playlistModalPlacardId && togglePlaylist(pl.id, playlistModalPlacardId)} className="flex-row items-center justify-between p-4 mb-3 rounded-[24px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                    <View className="flex-row items-center">
                      <View className="w-12 h-12 rounded-[16px] mr-4 items-center justify-center bg-[#F2F2F7]">
                        <ListMusic color="#8E8E93" size={22} strokeWidth={2} />
                      </View>
                      <Text className="text-[17px] font-medium text-[#1C1C1E]">{pl.name}</Text>
                    </View>
                    {pl.placardIds.includes(playlistModalPlacardId!) && <CheckCircle2 size={22} color="#5E5CE6" strokeWidth={2.5} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View className="flex-row items-center gap-3">
                <TextInput value={newPlaylistName} onChangeText={setNewPlaylistName} placeholder="New playlist..." placeholderTextColor="#8E8E93" className="flex-1 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-full px-5 h-14 font-medium text-[#1C1C1E] text-[16px]" />
                <TouchableOpacity
                  className="h-14 w-28 bg-[#5E5CE6] rounded-full items-center justify-center shadow-[0_4px_16px_rgba(94,92,230,0.25)]"
                  onPress={() => { if (newPlaylistName.trim() && playlistModalPlacardId) { createPlaylist(newPlaylistName.trim(), playlistModalPlacardId); setNewPlaylistName(''); } }}
                >
                  <Text className="text-white font-medium text-[16px]">Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
