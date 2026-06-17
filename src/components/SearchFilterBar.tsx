import React from 'react';
import { View, TextInput, ScrollView, TouchableOpacity, Text } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { DifficultyLevels } from '@/types/revision';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

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
}: ChipProps) => {
  const palette = useThemePalette();
  return (
    <TouchableOpacity
      onPress={onPress}
      className="px-4 py-1.5 rounded-[20px] mr-2 mb-2 border"
      style={{ 
        backgroundColor: active ? addAlpha(palette.accent, 0.08) : palette.surface, 
        borderColor: active ? palette.accent : palette.border,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: palette.isDark ? 0.15 : 0.015,
        shadowRadius: 8,
        elevation: 1,
      }}
    >
      <Text 
        className="text-[13px] font-semibold"
        style={{ color: active ? palette.accent : palette.textSecondary }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}, (prev, next) => {
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
  const palette = useThemePalette();
  const hasFilters = topic || difficulty || tag;

  const [localSearch, setLocalSearch] = React.useState(search);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      onSearchChange(localSearch);
    }, 250);
    return () => clearTimeout(handler);
  }, [localSearch, onSearchChange]);

  React.useEffect(() => {
    if (search !== localSearch) {
      setLocalSearch(search);
    }
  }, [search]);

  return (
    <View className="mb-5">
      <View
        className="flex-row items-center rounded-[24px] px-6 py-3 border"
        style={{ 
          backgroundColor: palette.inputBg,
          borderColor: palette.border,
          shadowColor: palette.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: palette.isDark ? 0.20 : 0.035,
          shadowRadius: 16,
          elevation: 2,
        }}
      >
        <Search color={palette.textMuted} size={18} strokeWidth={2} />
        <TextInput
          value={localSearch}
          onChangeText={setLocalSearch}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          className="flex-1 ml-3 text-base"
          style={{ color: palette.textPrimary }}
        />
        {localSearch.length > 0 && (
          <TouchableOpacity onPress={() => setLocalSearch('')}>
            <X color={palette.textMuted} size={16} />
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
              className="px-4 py-1.5 rounded-[20px] mr-2 border justify-center items-center"
              style={{ backgroundColor: palette.surface, borderColor: palette.border }}
            >
              <Text className="text-xs font-semibold" style={{ color: palette.textSecondary }}>Clear</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

