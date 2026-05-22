import React from 'react';
import { View, Text } from 'react-native';
import { ITemplateProps } from '@/types/templates';

export const DryRunTemplate = ({ body, card }: ITemplateProps) => {
  return (
    <View className="flex-1">
      <Text className="text-slate-600 text-sm leading-relaxed font-semibold mb-4">
        {body || "Stepping through the algorithmic state:"}
      </Text>
      <View className="border border-slate-200 rounded-2xl bg-slate-50 p-4">
        <View className="flex-row justify-between border-b border-slate-200 pb-2 mb-2">
          <Text className="text-slate-400 font-mono text-[9px] font-black uppercase">Iteration</Text>
          <Text className="text-slate-400 font-mono text-[9px] font-black uppercase">State Variable Trace</Text>
        </View>
        {card.examples?.map((ex, i) => (
          <View key={i} className="flex-row items-start justify-between py-2 border-b border-slate-100 last:border-b-0">
            <Text className="text-slate-900 font-mono text-[11px] font-black">#{i + 1}</Text>
            <Text className="text-violet-600 font-mono text-[11px] font-bold text-right flex-1 pl-4">
              {ex}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};