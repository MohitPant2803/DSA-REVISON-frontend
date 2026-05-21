import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Sheet } from '../types';
import { useRouter, usePathname } from 'expo-router';
import { useAppStore } from '../store/useAppStore';
import { BookMarked, PlayCircle } from 'lucide-react-native';

interface SheetCardProps {
  sheet: Sheet;
}

export function SheetCard({ sheet }: SheetCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const setSelectedSheetId = useAppStore(state => state.setSelectedSheetId);
  const progress = (sheet.completedQuestions / sheet.totalQuestions) * 100;

  const handlePress = () => {
    setSelectedSheetId(sheet.id);
    if (pathname !== '/reels') {
      router.push('/reels');
    }
  };

  return (
    <TouchableOpacity 
      activeOpacity={0.9}
      onPress={handlePress}
      className="bg-white p-6 rounded-[32px] mb-5 border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden flex-col"
    >
      {/* Subtle Internal Glow */}
      <View className="absolute -right-10 -bottom-10 w-32 h-32 bg-violet-100/50 rounded-full blur-2xl" />

      <View className="flex-row justify-between items-start mb-4">
        <View className="bg-violet-50 p-3 rounded-2xl border border-violet-100/50 shadow-sm shadow-violet-100">
          <BookMarked color="#7c3aed" size={24} />
        </View>
        <View className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl flex-row items-center">
          <Text className="text-slate-500 font-bold text-[11px] uppercase tracking-widest">{sheet.totalQuestions} Questions</Text>
        </View>
      </View>
      
      <View className="mb-5">
        <Text className="text-slate-900 text-[22px] font-black mb-1.5 tracking-tight leading-tight">{sheet.title}</Text>
        <Text className="text-slate-500 text-[14px] font-medium leading-relaxed" numberOfLines={2}>{sheet.description}</Text>
      </View>

      <View className="mt-auto">
        <View className="flex-row justify-between items-center mb-2.5">
          <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Mastery</Text>
          <Text className="text-slate-600 text-[11px] font-bold">{progress}%</Text>
        </View>
        <View className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-4 shadow-inner">
          <View className="h-full bg-violet-500 rounded-full" style={{ width: `${progress}%` }} />
        </View>
        
        <View className="flex-row items-center justify-between pt-4 border-t border-slate-100/80">
          <Text className="text-slate-400 text-xs font-bold tracking-tight">{sheet.completedQuestions} / {sheet.totalQuestions} Solved</Text>
          <View className="bg-violet-600 p-2.5 rounded-full shadow-md shadow-violet-300">
            <PlayCircle color="#ffffff" size={18} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}