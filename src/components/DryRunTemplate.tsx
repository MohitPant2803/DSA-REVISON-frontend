import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ITemplateProps } from '@/types/templates';
import { RichText } from '@/components/RichText';

export const DryRunTemplate = ({ body, card }: ITemplateProps) => {
  return (
    <View className="flex-1">
      <RichText
        text={body || "Stepping through the algorithmic state:"}
        style={{ color: '#475569', fontSize: 14, lineHeight: 22, fontWeight: '600', marginBottom: 16 }}
        boldStyle={{ color: '#0F172A' }}
      />
      <View className="border border-slate-200 rounded-2xl bg-slate-50 p-4">
        <View className="flex-row justify-between border-b border-slate-200 pb-2 mb-2">
          <Text className="text-slate-400 font-mono text-[9px] font-black uppercase">Iteration</Text>
          <Text className="text-slate-400 font-mono text-[9px] font-black uppercase">State Variable Trace</Text>
        </View>
        {card.examples?.map((ex, i) => (
          <View key={i} className="flex-row items-start justify-between py-2 border-b border-slate-100 last:border-b-0">
            <Text className="text-slate-900 font-mono text-[11px] font-black">#{i + 1}</Text>
            <RichText
              text={ex || ''}
              style={{ color: '#7C3AED', fontSize: 11, lineHeight: 16, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', textAlign: 'right', flex: 1, paddingLeft: 16 }}
              boldStyle={{ color: '#5B21B6' }}
            />
          </View>
        ))}
      </View>
    </View>
  );
};