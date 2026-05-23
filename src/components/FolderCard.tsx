import React from 'react';
import { View, Text } from 'react-native';
import { SpringPressable } from './SpringPressable';
import {
  Folder,
  Layers,
  GitBranch,
  Zap,
  Database,
  BookOpen,
  Code,
  Brain,
  ChevronRight,
} from 'lucide-react-native';
import type { IFolder } from '@/types/folder';

const ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number; strokeWidth?: number }>> = {
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
  completedLoops?: number;
}

function FolderCardComponent({ folder, onPress, onLongPress, completedLoops = 0 }: FolderCardProps) {
  const IconComponent = ICON_MAP[folder.icon] || Folder;
  const cardCount = folder.cardCount ?? 0;
  const accent = folder.color || '#8B5CF6';

  return (
    <SpringPressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="rounded-[22px] p-5 border border-slate-100/60 mb-2.5 flex-row items-center"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.82)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 0,
      }}
    >
      <View
        className="w-11 h-11 rounded-2xl mr-4 justify-center items-center"
        style={{ backgroundColor: accent + '10' }}
      >
        <IconComponent color={accent} size={18} strokeWidth={1.75} />
      </View>

      <View className="flex-1 justify-center pr-3">
        <View className="flex-row items-center gap-2 mb-0.5">
          <Text className="text-[#0F172A] text-[17px] font-normal tracking-tight" numberOfLines={1}>
            {folder.title}
          </Text>
          {completedLoops > 0 && (
            <View className="bg-violet-100 px-2 py-0.5 rounded-full self-start">
              <Text className="text-violet-600 text-[9px] font-bold tracking-wider">LOOP {completedLoops}</Text>
            </View>
          )}
        </View>
        {folder.description ? (
          <Text className="text-[#64748B] text-sm leading-relaxed" numberOfLines={2}>
            {folder.description}
          </Text>
        ) : (
          <Text className="text-[#94A3B8] text-sm">{cardCount} {cardCount === 1 ? 'card' : 'cards'}</Text>
        )}
        {folder.description ? (
          <Text className="text-[#94A3B8] text-xs mt-1.5">
            {cardCount} {cardCount === 1 ? 'card' : 'cards'}
          </Text>
        ) : null}
      </View>

      <ChevronRight color="#CBD5E1" size={18} strokeWidth={2} />
    </SpringPressable>
  );
}

export const FolderCard = React.memo(FolderCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.completedLoops === nextProps.completedLoops &&
    prevProps.folder._id === nextProps.folder._id &&
    prevProps.folder.title === nextProps.folder.title &&
    prevProps.folder.description === nextProps.folder.description &&
    prevProps.folder.color === nextProps.folder.color &&
    prevProps.folder.icon === nextProps.folder.icon &&
    prevProps.folder.cardCount === nextProps.folder.cardCount
  );
});
