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
  const Chip = ({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      className={`px-3.5 py-1.5 rounded-full mr-2 mb-2 border ${
        active ? 'bg-violet-50/80 border-violet-100' : 'border-slate-100'
      }`}
      style={{ backgroundColor: active ? undefined : 'rgba(255,255,255,0.82)' }}
    >
      <Text className={`text-[14px] font-normal ${active ? 'text-violet-600' : 'text-[#64748B]'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const hasFilters = topic || difficulty || tag;

  return (
    <View className="mb-5">
      <View
        className="flex-row items-center rounded-2xl px-4 py-3 border border-slate-100/80"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.82)' }}
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
              className="px-3.5 py-1.5 rounded-full bg-slate-50 mr-2"
            >
              <Text className="text-slate-500 text-sm font-medium">Clear</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}
