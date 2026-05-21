import React from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { styled } from 'nativewind';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Animated, { FadeInDown } from 'react-native-reanimated';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/styles/hljs';
import { Tag, Code, BookOpen, Heart, BrainCircuit, Edit, Trash2 } from 'lucide-react-native';
import Toast from 'react-native-toast-message';

import { IPopulatedRevisionCard } from '../../(tabs)/useRevisionCards';
import { useUpdateCardProgress } from '../../../hooks/useProgress';
import { useDeleteRevisionCard } from '../../(tabs)/useRevisionCards';

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledImage = styled(Image);
const StyledScrollView = styled(ScrollView);
const StyledTouchableOpacity = styled(TouchableOpacity);
const AnimatedView = styled(Animated.View);

type AppStackParamList = {
  CreateRevision: { card?: IPopulatedRevisionCard };
};
type NavigationProp = StackNavigationProp<AppStackParamList, 'CreateRevision'>;

interface RevisionCardProps {
  card: IPopulatedRevisionCard;
  currentIndex: number;
  totalCount: number;
}

interface ActionButtonProps {
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
}

const ActionButton = ({ onPress, icon, label, isActive }: ActionButtonProps) => (
  <StyledTouchableOpacity onPress={onPress} className="items-center gap-1.5">
    <StyledView className={`p-3 rounded-full ${isActive ? 'bg-blue-500' : 'bg-zinc-700/60'}`}>
      {icon}
    </StyledView>
    <StyledText className="text-zinc-400 text-xs font-bold">{label}</StyledText>
  </StyledTouchableOpacity>
);

const DifficultyBadge = ({ difficulty }: { difficulty: IPopulatedRevisionCard['difficulty'] | string }) => {
  const color =
    difficulty === 'Easy'
      ? 'bg-green-500/20 text-green-400'
      : difficulty === 'Medium'
      ? 'bg-yellow-500/20 text-yellow-400'
      : 'bg-red-500/20 text-red-400';

  return (
    <StyledView className={`px-4 py-1.5 rounded-full ${color.split(' ')[0]}`}>
      <StyledText className={`font-bold text-sm ${color.split(' ')[1]}`}>{difficulty}</StyledText>
    </StyledView>
  );
};

const TopicBadge = ({ topic }: { topic: string }) => {
  return (
    <StyledView className="flex-row items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20">
      <Tag color="#60a5fa" size={16} />
      <StyledText className="font-bold text-sm text-blue-400">{topic}</StyledText>
    </StyledView>
  );
};

export const RevisionCard = ({ card, currentIndex, totalCount }: RevisionCardProps) => {
  const navigation = useNavigation<NavigationProp>();
  const { mutate: updateProgress } = useUpdateCardProgress();
  const { mutate: deleteCard } = useDeleteRevisionCard();

  // NOTE: In a real app, you'd get the current user's ID from a global state/context.
  const currentUserId = card.createdBy._id; // For demo: assume user owns the card.
  const isOwner = card.createdBy._id === currentUserId;

  const handleProgressUpdate = (action: 'favorite' | 'difficult') => {
    const currentValue = !!card[action];
    updateProgress({ cardId: card._id, action, value: !currentValue });
    if (action === 'favorite') {
      Toast.show({
        type: 'success',
        text1: currentValue ? 'Removed from Favorites' : 'Added to Favorites',
        position: 'top',
        visibilityTime: 1500,
      });
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Card', 'Are you sure you want to permanently delete this card?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteCard(card._id),
      },
    ]);
  };

  const handleEdit = () => {
    navigation.navigate('CreateRevision', { card });
  };

  return (
    <StyledView className="flex-1 bg-black">
      {/* Progress Bar */}
      <StyledView className="absolute top-0 left-0 right-0 h-1 bg-zinc-800">
        <StyledView
          style={{ width: `${((currentIndex + 1) / totalCount) * 100}%` }}
          className="h-1 bg-blue-500"
        />
      </StyledView>

      <StyledView className="flex-1 pt-12 pb-24">
        <StyledScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <AnimatedView entering={FadeInDown.duration(500)} className="gap-y-6">
            {/* Header with Topic and Difficulty */}
            <StyledView className="flex-row justify-between items-center">
              <TopicBadge topic={card.topic} />
              <DifficultyBadge difficulty={card.difficulty} />
            </StyledView>

            {/* Title */}
            <StyledText className="text-white text-4xl font-extrabold tracking-tighter leading-tight">
              {card.title}
            </StyledText>

            {/* Optional Image */}
            {card.image && (
              <StyledImage
                source={{ uri: card.image }}
                className="w-full h-56 rounded-2xl bg-zinc-800"
                resizeMode="cover"
              />
            )}

            {/* Explanation */}
            <StyledView className="gap-3">
              <StyledView className="flex-row items-center gap-3">
                <BookOpen color="#a1a1aa" size={20} />
                <StyledText className="text-zinc-400 text-xl font-bold">Explanation</StyledText>
              </StyledView>
              <StyledText className="text-zinc-300 text-lg leading-relaxed">{card.explanation}</StyledText>
            </StyledView>

            {/* Optional Code Block */}
            {card.code && (
              <StyledView className="gap-3">
                <StyledView className="flex-row items-center gap-3">
                  <Code color="#a1a1aa" size={20} />
                  <StyledText className="text-zinc-400 text-xl font-bold">Code</StyledText>
                </StyledView>
                <SyntaxHighlighter language="javascript" style={atomOneDark} customStyle={{ borderRadius: 16, padding: 16, fontSize: 14 }}>
                  {card.code}
                </SyntaxHighlighter>
              </StyledView>
            )}
          </AnimatedView>
        </StyledScrollView>
      </StyledView>

      {/* --- Quick Actions Sidebar --- */}
      <AnimatedView entering={FadeInDown.duration(600).delay(200)} className="absolute right-3 bottom-28 flex-col items-center gap-y-6">
        {isOwner && (
          <>
            <ActionButton onPress={handleEdit} icon={<Edit size={24} color="#a1a1aa" />} label="Edit" />
            <ActionButton onPress={handleDelete} icon={<Trash2 size={24} color="#a1a1aa" />} label="Delete" />
          </>
        )}
        <ActionButton
          onPress={() => handleProgressUpdate('favorite')}
          icon={<Heart size={24} color={card.isFavorite ? '#ef4444' : '#a1a1aa'} fill={card.isFavorite ? '#ef4444' : 'transparent'} />}
          label="Favorite"
          isActive={card.isFavorite}
        />
        <ActionButton
          onPress={() => handleProgressUpdate('difficult')}
          icon={<BrainCircuit size={24} color={card.isDifficult ? '#facc15' : '#a1a1aa'} />}
          label="Difficult"
          isActive={card.isDifficult}
        />
      </AnimatedView>
    </StyledView>
  );
};

export default RevisionCard;