import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';

export const DifficultyBadge = ({ difficulty }: { difficulty: IPopulatedRevisionCard['difficulty'] | string }) => {
  const styles =
    difficulty === 'Easy'
      ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' }
      : difficulty === 'Medium'
      ? { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' }
      : { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100' };

  return (
    <View className={`px-2.5 py-1 rounded-full border ${styles.bg} ${styles.border}`}>
      <Text className={`text-xs font-medium ${styles.text}`}>{difficulty}</Text>
    </View>
  );
};

export const TopicBadge = ({ topic }: { topic: string }) => {
  return (
    <View className="px-2.5 py-1 rounded-full bg-violet-50 border border-violet-100">
      <Text className="text-xs font-medium text-violet-700" numberOfLines={1}>
        {topic}
      </Text>
    </View>
  );
};

interface CinematicCardWrapperProps {
  card: IPopulatedRevisionCard;
  headline: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  slideIndex: number;
  totalSlides: number;
  footerContent?: React.ReactNode;
}

export const CinematicCardWrapper = ({
  card,
  headline,
  icon,
  children,
  slideIndex,
  totalSlides,
  footerContent,
}: CinematicCardWrapperProps) => {
  return (
    <View className="flex-1 justify-between bg-transparent h-full">
      <Text className="text-[#94A3B8] text-[13px] mb-3">
        {card.topic} · {card.difficulty}
      </Text>

      <Text className="text-[#0F172A] font-normal tracking-tight leading-tight mb-6 text-[28px]">
        {headline}
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1 mb-5">
        {children}
      </ScrollView>

      <View className="flex-row items-center justify-between border-t border-slate-100/80 pt-5">
        <Text className="text-[#94A3B8] text-[13px]">
          {slideIndex + 1} of {totalSlides}
        </Text>
        {footerContent}
      </View>
    </View>
  );
};
