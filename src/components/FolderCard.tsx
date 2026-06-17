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
  Pin,
} from 'lucide-react-native';
import type { IFolder } from '@/types/folder';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

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
  pinned?: boolean;
}

function FolderCardComponent({ folder, onPress, onLongPress, hideCardCount = false, pinned = false }: FolderCardProps) {
  const palette = useThemePalette();
  const IconComponent = ICON_MAP[folder.icon] || Folder;
  const count = folder.cardCount ?? 0;
  const accent = folder.color || palette.accent;

  const isOrganizational = folder.hasSubfolders === true;
  const isLeaf = folder.hasSubfolders === false;
  const shouldShowCardCount = isLeaf && !hideCardCount;
  
  const cardLabel = count === 1 ? '1 card' : `${count} cards`;

  return (
    <SpringPressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="rounded-[30px] p-5 border mb-4 flex-row items-center"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: palette.isDark ? 0.2 : 0.03,
        shadowRadius: 18,
        elevation: 2,
      }}
    >
      <View
        className="w-11 h-11 rounded-2xl mr-4 justify-center items-center border"
        style={{ 
          backgroundColor: addAlpha(accent, 0.08), 
          borderColor: palette.border,
          opacity: 0.95
        }}
      >
        <IconComponent color={accent} size={18} strokeWidth={2.0} />
      </View>
 
      <View className="flex-1 justify-center pr-3">
        <View className="flex-row items-center gap-2 mb-1">
          <Text 
            className="text-[16px] font-bold tracking-tight" 
            style={{ color: palette.textPrimary }}
            numberOfLines={1}
          >
            {folder.title}
          </Text>
        </View>
 
        {folder.description ? (
          <Text 
            className="text-xs leading-relaxed mb-1.5" 
            style={{ color: palette.textSecondary }}
            numberOfLines={2}
          >
            {folder.description}
          </Text>
        ) : null}
 
        {shouldShowCardCount && (
          <Text 
            className="text-[11px] font-bold"
            style={{ color: palette.accent }}
          >
            {cardLabel}
          </Text>
        )}
      </View>
 
      {pinned && (
        <View style={{ marginRight: 8, transform: [{ rotate: '45deg' }] }}>
          <Pin color={accent} size={15} strokeWidth={2.4} />
        </View>
      )}
      <ChevronRight color={palette.textSecondary} size={18} strokeWidth={2.2} />
    </SpringPressable>
  );
}

export const FolderCard = React.memo(FolderCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.hideCardCount === nextProps.hideCardCount &&
    prevProps.pinned === nextProps.pinned &&
    prevProps.folder._id === nextProps.folder._id &&
    prevProps.folder.title === nextProps.folder.title &&
    prevProps.folder.description === nextProps.folder.description &&
    prevProps.folder.color === nextProps.folder.color &&
    prevProps.folder.icon === nextProps.folder.icon &&
    prevProps.folder.cardCount === nextProps.folder.cardCount
  );
});
