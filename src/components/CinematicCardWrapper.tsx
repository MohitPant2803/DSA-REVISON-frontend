import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

export const DifficultyBadge = ({ difficulty }: { difficulty: IPopulatedRevisionCard['difficulty'] | string }) => {
  const palette = useThemePalette();
  
  const statusColor =
    difficulty === 'Easy'
      ? palette.success
      : difficulty === 'Medium'
      ? palette.warning
      : palette.error;

  return (
    <View 
      className="px-2.5 py-1 rounded-full border"
      style={{
        backgroundColor: addAlpha(statusColor, 0.08),
        borderColor: addAlpha(statusColor, 0.15),
      }}
    >
      <Text 
        className="text-xs font-medium"
        style={{ color: statusColor }}
      >
        {difficulty}
      </Text>
    </View>
  );
};

export const TopicBadge = ({ topic }: { topic: string }) => {
  const palette = useThemePalette();
  return (
    <View 
      className="px-2.5 py-1 rounded-full border"
      style={{
        backgroundColor: addAlpha(palette.accent, 0.08),
        borderColor: addAlpha(palette.accent, 0.15),
      }}
    >
      <Text 
        className="text-xs font-medium" 
        style={{ color: palette.accent }}
        numberOfLines={1}
      >
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
  const palette = useThemePalette();

  return (
    <View className="flex-1 justify-between bg-transparent h-full">
      <Text 
        className="text-[13px] mb-3"
        style={{ color: palette.textMuted }}
      >
        {card.topic} · {card.difficulty}
      </Text>

      <Text 
        className="font-semibold tracking-tight leading-tight mb-6 text-[24px]"
        style={{ color: palette.textPrimary }}
      >
        {headline}
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1 mb-5">
        {children}
      </ScrollView>

      <View 
        className="flex-row items-center justify-between border-t pt-5"
        style={{ borderColor: palette.border }}
      >
        <Text 
          className="text-[13px]"
          style={{ color: palette.textMuted }}
        >
          {slideIndex + 1} of {totalSlides}
        </Text>
        {footerContent}
      </View>
    </View>
  );
};
