import React from 'react';
import { View, TextInput, ScrollView, TouchableOpacity, Text } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { DifficultyLevels } from '@/types/revision';

interface SearchFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  topic?: string;
  onTopicChange?: (value: string | undefined) => void;
  difficulty?: string;
  onDifficultyChange?: (value: string | undefined) => void;
  tag?: string;
  onTagChange?: (value: string | undefined) => void;
  topics?: string[];
  tags?: string[];
  placeholder?: string;
}

const DIFFICULTIES = [...DifficultyLevels];

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

const Chip = React.memo(({
  label,
  active,
  onPress,
}: ChipProps) => (
  <TouchableOpacity
    onPress={onPress}
    className="px-4 py-1.5 rounded-[20px] mr-2 mb-2 border"
    style={{ 
      backgroundColor: active ? 'rgba(139, 92, 246, 0.04)' : '#FFFFFF', 
      borderColor: active ? 'rgba(139, 92, 246, 0.12)' : 'rgba(148,163,184,0.08)',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.015,
      shadowRadius: 8,
      elevation: 1,
    }}
  >
    <Text className={`text-[13px] font-semibold ${active ? 'text-[#8B5CF6]' : 'text-[#64748B]'}`}>
      {label}
    </Text>
  </TouchableOpacity>
), (prev, next) => {
  return prev.label === next.label && prev.active === next.active;
});

export function SearchFilterBar({
  search,
  onSearchChange,
  topic,
  onTopicChange,
  difficulty,
  onDifficultyChange,
  tag,
  onTagChange,
  topics = [],
  tags = [],
  placeholder = 'Search...',
}: SearchFilterBarProps) {

  const hasFilters = topic || difficulty || tag;

  return (
    <View className="mb-5">
      <View
        className="flex-row items-center rounded-[24px] px-6 py-3 border"
        style={{ 
          backgroundColor: '#FFFFFF',
          borderColor: 'rgba(148, 163, 184, 0.08)',
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.035,
          shadowRadius: 16,
          elevation: 2,
        }}
      >
        <Search color="#94A3B8" size={18} strokeWidth={2} />
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          className="flex-1 ml-3 text-[#0F172A] text-base"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange('')}>
            <X color="#94A3B8" size={16} />
          </TouchableOpacity>
        )}
      </View>

      {(topics.length > 0 || tags.length > 0 || onDifficultyChange) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ paddingRight: 16 }}
        >
          {onDifficultyChange &&
            DIFFICULTIES.map((d) => (
              <Chip
                key={d}
                label={d}
                active={difficulty === d}
                onPress={() => onDifficultyChange(difficulty === d ? undefined : d)}
              />
            ))}
          {topics.map((t) => (
            <Chip
              key={t}
              label={t}
              active={topic === t}
              onPress={() => onTopicChange?.(topic === t ? undefined : t)}
            />
          ))}
          {tags.map((t) => (
            <Chip
              key={t}
              label={`#${t}`}
              active={tag === t}
              onPress={() => onTagChange?.(tag === t ? undefined : t)}
            />
          ))}
          {hasFilters && (
            <TouchableOpacity
              onPress={() => {
                onTopicChange?.(undefined);
                onDifficultyChange?.(undefined);
                onTagChange?.(undefined);
              }}
              className="px-4 py-1.5 rounded-[20px] bg-slate-50 mr-2 border border-slate-100"
            >
              <Text className="text-slate-500 text-xs font-semibold">Clear</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}
