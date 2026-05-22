import React from 'react';
import { View, Text } from 'react-native';
import { ITemplateProps } from '@/types/templates';

export const IntuitionTemplate = ({ body, card }: ITemplateProps) => {
  return (
    <View className="flex-1">
      <View className="p-7 rounded-[32px] bg-violet-950/30 border border-violet-800/40 mb-6 relative overflow-hidden">
        {/* Focal typography with deep gradient accent */}
        <View className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-violet-500/20 blur-3xl" />
        <Text className="text-violet-400 italic text-xl leading-relaxed font-bold">
          💡 "{body || card.explanation}"
        </Text>
      </View>
      <Text className="text-slate-500 text-sm leading-relaxed font-medium px-2">
        Visualizing this concept helps form the mental schema needed to map standard interview solutions.
      </Text>
    </View>
  );
};