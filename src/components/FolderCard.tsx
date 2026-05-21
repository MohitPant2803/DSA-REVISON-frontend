import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import {
  Folder,
  Layers,
  GitBranch,
  Zap,
  Database,
  BookOpen,
  Code,
  Brain,
} from 'lucide-react-native';
import type { IFolder } from '@/types/folder';

const ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number }>> = {
  folder: Folder,
  layers: Layers,
  graphs: GitBranch,
  dp: Zap,
  database: Database,
  book: BookOpen,
  code: Code,
  brain: Brain,
};

interface FolderCardProps {
  folder: IFolder;
  onPress: () => void;
  onLongPress?: () => void;
}

export function FolderCard({ folder, onPress, onLongPress }: FolderCardProps) {
  const IconComponent = ICON_MAP[folder.icon] || Folder;
  const cardCount = folder.cardCount ?? 0;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm mb-4"
      style={{ borderLeftWidth: 4, borderLeftColor: folder.color }}
    >
      <View className="flex-row items-start justify-between">
        <View
          className="p-3 rounded-2xl mr-4"
          style={{ backgroundColor: `${folder.color}18` }}
        >
          <IconComponent color={folder.color} size={22} />
        </View>
        <View className="flex-1">
          <Text className="text-slate-900 text-lg font-semibold tracking-tight mb-1">
            {folder.title}
          </Text>
          {folder.description ? (
            <Text className="text-slate-500 text-sm leading-relaxed" numberOfLines={2}>
              {folder.description}
            </Text>
          ) : null}
          <Text className="text-slate-400 text-xs font-medium mt-3">
            {cardCount} {cardCount === 1 ? 'card' : 'cards'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
