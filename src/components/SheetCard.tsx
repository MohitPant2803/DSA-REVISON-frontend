import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Sheet } from '../types';
import { useRouter, usePathname } from 'expo-router';
import { useAppStore } from '../store/useAppStore';
import { ChevronRight } from 'lucide-react-native';

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
      className="p-5 rounded-[22px] mb-2.5 border border-slate-100/60 flex-row items-center"
      style={{ backgroundColor: 'rgba(255, 255, 255, 0.82)' }}
    >
      <View className="flex-1 pr-3">
        <Text className="text-[#0F172A] text-[17px] font-normal tracking-tight mb-1" numberOfLines={1}>
          {sheet.title}
        </Text>
        <Text className="text-[#64748B] text-[15px] leading-relaxed mb-3" numberOfLines={2}>
          {sheet.description}
        </Text>
        <View className="h-0.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <View className="h-full bg-violet-300 rounded-full" style={{ width: `${progress}%` }} />
        </View>
        <Text className="text-[#94A3B8] text-[13px] mt-2">
          {sheet.completedQuestions} of {sheet.totalQuestions} solved
        </Text>
      </View>
      <ChevronRight color="#CBD5E1" size={18} strokeWidth={1.75} />
    </TouchableOpacity>
  );
}
