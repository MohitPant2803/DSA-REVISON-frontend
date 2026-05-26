import React from 'react';
import { View, Text } from 'react-native';
import { ITemplateProps } from '@/types/templates';
import { RichText } from '@/components/RichText';

export const IntuitionTemplate = ({ body, card }: ITemplateProps) => {
  return (
    <View className="flex-1">
      <View className="p-7 rounded-[32px] bg-violet-950/30 border border-violet-800/40 mb-6 relative overflow-hidden">
        {/* Focal typography with deep gradient accent */}
        <View className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-violet-500/20 blur-3xl" />
        <RichText
          text={`💡 "${body || card.explanation || ''}"`}
          style={{ color: '#a78bfa', fontStyle: 'italic', fontSize: 20, lineHeight: 30, fontWeight: '700' }}
          boldStyle={{ color: '#c4b5fd' }}
        />
      </View>
      <Text className="text-slate-500 text-sm leading-relaxed font-medium px-2">
        Visualizing this concept helps form the mental schema needed to map standard interview solutions.
      </Text>
    </View>
  );
};