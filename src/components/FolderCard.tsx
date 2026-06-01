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
  hideCardCount?: boolean;
}

function FolderCardComponent({ folder, onPress, onLongPress, hideCardCount = false }: FolderCardProps) {
  const IconComponent = ICON_MAP[folder.icon] || Folder;
  const count = folder.cardCount ?? 0;
  const accent = folder.color || '#8B5CF6';

  const isOrganizational = folder.hasSubfolders === true;
  const isLeaf = folder.hasSubfolders === false;
  const shouldShowCardCount = isLeaf && !hideCardCount;
  
  const cardLabel = count === 1 ? '1 card' : `${count} cards`;

  return (
    <SpringPressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="rounded-[30px] p-5 border mb-4 flex-row items-center bg-white"
      style={{
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.03,
        shadowRadius: 18,
        elevation: 2,
      }}
    >
      <View
        className="w-11 h-11 rounded-2xl mr-4 justify-center items-center border"
        style={{ 
          backgroundColor: accent + '10', 
          borderColor: 'rgba(15, 23, 42, 0.04)',
          opacity: 0.8
        }}
      >
        <IconComponent color={accent} size={18} strokeWidth={2.0} />
      </View>
 
      <View className="flex-1 justify-center pr-3">
        <View className="flex-row items-center gap-2 mb-1">
          <Text className="text-[#0F172A] text-[16px] font-bold tracking-tight" numberOfLines={1}>
            {folder.title}
          </Text>
        </View>
 
        {folder.description ? (
          <Text className="text-[#475569] text-xs leading-relaxed mb-1.5" numberOfLines={2}>
            {folder.description}
          </Text>
        ) : null}
 
        {shouldShowCardCount && (
          <Text className="text-[#8B5CF6] text-[11px] font-bold">
            {cardLabel}
          </Text>
        )}
      </View>
 
      <ChevronRight color="rgba(15, 23, 42, 0.18)" size={18} strokeWidth={2.2} />
    </SpringPressable>
  );
}

export const FolderCard = React.memo(FolderCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.hideCardCount === nextProps.hideCardCount &&
    prevProps.folder._id === nextProps.folder._id &&
    prevProps.folder.title === nextProps.folder.title &&
    prevProps.folder.description === nextProps.folder.description &&
    prevProps.folder.color === nextProps.folder.color &&
    prevProps.folder.icon === nextProps.folder.icon &&
    prevProps.folder.cardCount === nextProps.folder.cardCount
  );
});
