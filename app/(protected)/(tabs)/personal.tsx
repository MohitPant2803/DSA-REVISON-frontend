import React from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useAppStore } from '../../../src/store/useAppStore';
import { SheetCard } from '../../../src/components/SheetCard';
import { Search, Plus, FolderHeart, Sparkles, ListMusic, LogOut } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useBookmarkStore } from '../../../src/store/useBookmarkStore';
import { useAuthStore } from '@/store/useAuthStore';

export default function PersonalScreen() {
  const router = useRouter();
  const sheets = useAppStore(state => state.sheets) || [];
  const searchQuery = useAppStore(state => state.searchQuery);
  const setSearchQuery = useAppStore(state => state.setSearchQuery);
  const playlists = useBookmarkStore(state => state.playlists) || [];
  const setActivePlaylistId = useBookmarkStore(state => state.setActivePlaylistId);
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to leave your peaceful space?',
      [
        { text: 'Stay here', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive', 
          onPress: () => logout?.()
        },
      ]
    );
  };

  const filteredSheets = (sheets || []).filter(sheet => 
    (sheet.title || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1 bg-[#f8fafc]" showsVerticalScrollIndicator={false}>
        {/* Premium Hero Section */}
        <View className="bg-slate-900 pt-8 pb-32 px-6 rounded-b-[48px] overflow-hidden relative shadow-2xl shadow-slate-900/40 z-10">
          <View className="absolute -top-32 -right-12 w-80 h-80 bg-fuchsia-500/30 rounded-full blur-3xl" />
          <View className="absolute top-10 -left-20 w-72 h-72 bg-violet-500/20 rounded-full blur-3xl" />

          <TouchableOpacity 
            onPress={handleLogout}
            activeOpacity={0.7}
            className="absolute top-8 right-6 bg-red-500 px-4 py-2 rounded-full flex-row items-center z-50 shadow-lg shadow-red-900/40"
          >
            <LogOut color="#fff" size={16} />
            <Text className="text-white font-bold text-xs ml-2">Logout</Text>
          </TouchableOpacity>

          <View className="flex-row items-center justify-between mb-2 z-10">
            <View className="flex-1">
              <Animated.View entering={FadeInDown.delay(100)} className="flex-row items-center mb-3">
                <View className="bg-white/10 px-3 py-1.5 rounded-full flex-row items-center border border-white/20 backdrop-blur-md">
                  <Sparkles color="#e879f9" size={14} />
                  <Text className="text-fuchsia-300 text-[11px] font-black uppercase tracking-widest ml-1.5">Personal Space</Text>
                </View>
                {user?.email === 'mohit.pant@1828@gmail.com' && (
                  <Text className="ml-2 text-[10px] text-amber-400 font-bold uppercase">Superadmin</Text>
                )}
              </Animated.View>
              <Text className="text-white text-[38px] font-black tracking-tight mb-2">Your Library</Text>
              <Text className="text-slate-400 text-[16px] font-medium leading-relaxed max-w-[280px]">Curate, organize, and track your specialized study sheets.</Text>
            </View>
            <Animated.View entering={FadeInDown.delay(200)}>
              <TouchableOpacity activeOpacity={0.8} className="bg-fuchsia-500 p-4 rounded-[24px] shadow-lg shadow-fuchsia-500/40">
                <Plus color="#fff" size={26} strokeWidth={2.5} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        <View className="-mt-12 px-6 z-20">

          {playlists.length > 0 && (
            <Animated.View entering={FadeInUp.delay(250).springify()} className="mb-10">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-slate-800 text-[20px] font-black tracking-tight">Your Playlists</Text>
              </View>
              <View className="flex-row flex-wrap justify-between">
                {playlists.map((pl, index) => (
                  <TouchableOpacity 
                    key={pl.id} 
                    activeOpacity={0.9}
                    onPress={() => { setActivePlaylistId(pl.id); router.push('/reels'); }}
                    className="w-[48%] p-4 rounded-[28px] mb-4 relative overflow-hidden justify-between border border-white/20 shadow-md shadow-slate-300/30"
                    style={{ backgroundColor: pl.color1 }}
                  >
                    <View className="absolute -right-6 -top-6 w-24 h-24 rounded-full blur-xl opacity-60" style={{ backgroundColor: pl.color2 }} />
                    <View className="bg-white/20 self-start p-2.5 rounded-2xl backdrop-blur-md mb-3"><ListMusic color="#fff" size={20} /></View>
                    <Text className="text-white font-black text-[16px] tracking-tight leading-tight mb-1" numberOfLines={2}>{pl.name}</Text>
                    <Text className="text-white/80 font-bold text-[10px] uppercase tracking-widest">{pl.placardIds.length} Items</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          )}

          <Animated.View entering={FadeInUp.delay(300).springify()} className="flex-row items-center bg-white rounded-full px-6 py-4 mb-10 shadow-xl shadow-slate-200/30 border border-slate-100">
            <Search color="#94a3b8" size={22} />
            <TextInput
              className="flex-1 ml-3 text-slate-900 text-[15px] font-medium"
              placeholder="Search custom sheets..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </Animated.View>

        {filteredSheets.map((sheet, index) => (
          <Animated.View key={sheet.id} entering={FadeInUp.delay(400 + index * 100).springify()}>
            <SheetCard sheet={sheet} />
          </Animated.View>
        ))}
        
        {filteredSheets.length === 0 && (
          <Animated.View entering={FadeInUp.delay(400)} className="py-12 items-center justify-center bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/30">
            <View className="bg-slate-50 p-4 rounded-full mb-4">
              <FolderHeart color="#94a3b8" size={32} />
            </View>
            <Text className="text-slate-800 font-bold text-lg mb-1 tracking-tight">No sheets found</Text>
            <Text className="text-slate-400 font-medium text-sm text-center px-8">Try adjusting your search or create a new custom journey.</Text>
          </Animated.View>
        )}
        
        <View className="h-12" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}