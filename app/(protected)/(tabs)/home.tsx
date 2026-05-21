import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { styled } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Flame, Target, Book, Star, ArrowRight, Clock } from 'lucide-react-native';

import { useGetUserProgress } from '../../../src/hooks/useUserProgress';
import { useGetRevisionCards, IPopulatedRevisionCard } from './useRevisionCards';

// Styled Components
const StyledView = styled(View);
const StyledText = styled(Text);
const StyledScrollView = styled(ScrollView);
const StyledTouchableOpacity = styled(TouchableOpacity);
const AnimatedView = styled(Animated.View);

// --- Reusable Components ---

const SectionHeader = ({ title }: { title: string }) => (
  <StyledText className="text-white text-2xl font-bold tracking-tight mb-4">{title}</StyledText>
);

const MiniRevisionCard = ({ card }: { card: IPopulatedRevisionCard }) => (
  <StyledTouchableOpacity className="bg-zinc-800 w-64 rounded-2xl p-4 border border-zinc-700 mr-4">
    <StyledText className="text-white font-bold text-base h-12" numberOfLines={2}>
      {card.title}
    </StyledText>
    <StyledView className="flex-row items-center mt-2">
      <StyledView className="px-2 py-0.5 bg-blue-500/20 rounded-full">
        <StyledText className="text-blue-400 text-xs font-bold">{card.topic}</StyledText>
      </StyledView>
    </StyledView>
  </StyledTouchableOpacity>
);

const CardCarousel = ({
  cards,
  isLoading,
}: {
  cards: IPopulatedRevisionCard[] | undefined;
  isLoading: boolean;
}) => {
  if (isLoading) {
    return <ActivityIndicator color="#ffffff" className="my-4" />;
  }
  if (!cards || cards.length === 0) {
    return <StyledText className="text-zinc-500">No cards to show yet.</StyledText>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6">
      {cards.map((card) => (
        <MiniRevisionCard key={card._id} card={card} />
      ))}
    </ScrollView>
  );
};

const HomeScreen = () => {
  const { data: progress, isLoading: isProgressLoading } = useGetUserProgress();
  const { data: difficultCards, isLoading: isDifficultLoading } = useGetRevisionCards({
    difficulty: 'Hard',
    limit: '5',
  });
  const { data: savedCards, isLoading: isSavedLoading } = useGetRevisionCards({
    // This would need a backend flag, for now we'll use a topic as a placeholder
    topic: 'Data Structures',
    limit: '5',
  });
  const { data: continueCardData, isLoading: isContinueLoading } = useGetRevisionCards({
    // This hook fetches a list, so we fetch the single card by its ID
    _id: progress?.lastViewedCardId,
    limit: '1',
  });

  const continueCard = continueCardData?.results[0];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (isProgressLoading) {
    return (
      <StyledView className="flex-1 bg-black justify-center items-center">
        <ActivityIndicator size="large" color="#ffffff" />
      </StyledView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top']}>
      <StyledScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* --- Header --- */}
        <AnimatedView entering={FadeInDown.duration(400)} className="my-8">
          <StyledText className="text-zinc-400 text-lg font-medium">{getGreeting()}</StyledText>
          <StyledText className="text-white text-4xl font-bold tracking-tighter">
            Let's Revise!
          </StyledText>
        </AnimatedView>

        {/* --- Main Sections --- */}
        <AnimatedView entering={FadeIn.duration(500).delay(200)} className="gap-y-10">
          {/* Continue Learning */}
          {continueCard && !isContinueLoading && (
            <StyledView>
              <SectionHeader title="Continue Learning" />
              <StyledTouchableOpacity className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex-row items-center justify-between">
                <StyledView className="flex-1 mr-4">
                  <StyledView className="flex-row items-center mb-2">
                    <Clock color="#a1a1aa" size={14} className="mr-2" />
                    <StyledText className="text-zinc-400 text-xs font-bold uppercase">
                      Last Viewed
                    </StyledText>
                  </StyledView>
                  <StyledText className="text-white text-lg font-bold" numberOfLines={2}>
                    {continueCard.title}
                  </StyledText>
                </StyledView>
                <StyledView className="bg-blue-600 p-3 rounded-full">
                  <ArrowRight color="#ffffff" size={24} />
                </StyledView>
              </StyledTouchableOpacity>
            </StyledView>
          )}

          {/* Daily Streak & Progress */}
          <StyledView className="flex-row gap-4">
            <StyledView className="flex-1 bg-zinc-900 border border-zinc-800 rounded-3xl p-5 items-center justify-center">
              <Flame color="#f97316" size={32} />
              <StyledText className="text-white text-3xl font-bold mt-2">
                {progress?.streak.current || 0}
              </StyledText>
              <StyledText className="text-zinc-400 font-medium">Day Streak</StyledText>
            </StyledView>
            <StyledView className="flex-1 bg-zinc-900 border border-zinc-800 rounded-3xl p-5 items-center justify-center">
              <Target color="#3b82f6" size={32} />
              <StyledText className="text-white text-3xl font-bold mt-2">
                {progress?.revisionsToday || 0} / {progress?.dailyGoal || 10}
              </StyledText>
              <StyledText className="text-zinc-400 font-medium">Daily Goal</StyledText>
            </StyledView>
          </StyledView>

          {/* Difficult Cards */}
          <StyledView>
            <SectionHeader title="Toughest Cards" />
            <CardCarousel cards={difficultCards?.results} isLoading={isDifficultLoading} />
          </StyledView>

          {/* Saved Cards */}
          <StyledView>
            <SectionHeader title="Saved for Later" />
            <CardCarousel cards={savedCards?.results} isLoading={isSavedLoading} />
          </StyledView>

          {/* Topic Shortcuts */}
          <StyledView>
            <SectionHeader title="Topics" />
            <StyledView className="flex-row flex-wrap gap-3">
              {['Data Structures', 'Algorithms', 'System Design', 'Strings', 'Graphs'].map((topic) => (
                <StyledTouchableOpacity
                  key={topic}
                  className="bg-zinc-800 px-5 py-3 rounded-full border border-zinc-700"
                >
                  <StyledText className="text-white font-semibold text-base">{topic}</StyledText>
                </StyledTouchableOpacity>
              ))}
            </StyledView>
          </StyledView>
        </AnimatedView>
      </StyledScrollView>
    </SafeAreaView>
  );
};

export default HomeScreen;