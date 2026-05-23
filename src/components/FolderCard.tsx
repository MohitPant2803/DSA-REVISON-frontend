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
      className="rounded-[22px] p-5 border mb-2.5 flex-row items-center"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderColor: 'rgba(255, 255, 255, 0.07)',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 1,
      }}
    >
      <View
        className="w-11 h-11 rounded-2xl mr-4 justify-center items-center border"
        style={{ backgroundColor: accent + '15', borderColor: accent + '30' }}
      >
        <IconComponent color={accent} size={18} strokeWidth={2.0} />
      </View>

      <View className="flex-1 justify-center pr-3">
        <View className="flex-row items-center gap-2 mb-0.5">
          <Text className="text-[#F8FAFC] text-[17px] font-semibold tracking-tight" numberOfLines={1}>
            {folder.title}
          </Text>
          {completedLoops > 0 && (
            <View 
              className="px-2 py-0.5 rounded-full self-start border"
              style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', borderColor: 'rgba(139, 92, 246, 0.25)' }}
            >
              <Text className="text-[#8B5CF6] text-[8px] font-black tracking-wider">LOOP {completedLoops}</Text>
            </View>
          )}
        </View>
        {folder.description ? (
          <Text className="text-[#94A3B8] text-sm leading-relaxed" numberOfLines={2}>
            {folder.description}
          </Text>
        ) : (
          <Text className="text-[#64748B] text-sm">{cardCount} {cardCount === 1 ? 'card' : 'cards'}</Text>
        )}
        {folder.description ? (
          <Text className="text-[#64748B] text-xs mt-1.5 font-medium">
            {cardCount} {cardCount === 1 ? 'card' : 'cards'}
          </Text>
        ) : null}
      </View>

      <ChevronRight color="#475569" size={18} strokeWidth={2.5} />
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
