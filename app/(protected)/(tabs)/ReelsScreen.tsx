import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, FlatList, RefreshControl, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { useGetRevisionCards, IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { RevisionCard } from './RevisionCard';
import { useUpdateLastViewedCard } from '../../../src/services/useUserProgress';
import { useRole } from '@/hooks/useRole';

// Styled components polyfill for NativeWind v4 compatibility
const styled = (Component: any) => Component;
const StyledView = styled(View);
const StyledText = styled(Text);
const StyledTouchableOpacity = styled(TouchableOpacity);

const { height } = Dimensions.get('window');

// --- Loading Skeleton Component ---
const RevisionCardSkeleton = () => (
  <StyledView className="flex-1 bg-zinc-900 p-4 pt-16 h-full" style={{ height }}>
    <StyledView className="gap-5 pb-20 opacity-50">
      {/* Header */}
      <StyledView className="flex-row justify-between items-center">
        <StyledView className="h-8 w-24 bg-zinc-800 rounded-full" />
        <StyledView className="h-8 w-16 bg-zinc-800 rounded-full" />
      </StyledView>

      {/* Title */}
      <StyledView className="h-10 w-full bg-zinc-800 rounded-lg mt-4" />
      <StyledView className="h-8 w-3/4 bg-zinc-800 rounded-lg" />

      {/* Explanation */}
      <StyledView className="gap-2 mt-8">
        <StyledView className="h-6 w-40 bg-zinc-800 rounded-lg mb-2" />
        <StyledView className="h-4 w-full bg-zinc-800 rounded-lg" />
        <StyledView className="h-4 w-full bg-zinc-800 rounded-lg" />
        <StyledView className="h-4 w-5/6 bg-zinc-800 rounded-lg" />
      </StyledView>
    </StyledView>
  </StyledView>
);

// --- Navigation Types ---
type AppStackParamList = {
  Reels: undefined;
  CreateRevision: { card?: IPopulatedRevisionCard };
};
type ReelsScreenNavigationProp = any;

const ReelsScreen = () => {
  const navigation = useNavigation<ReelsScreenNavigationProp>();
  const [page, setPage] = useState(1);
  const [allCards, setAllCards] = useState<IPopulatedRevisionCard[]>([]);
  const { data, isLoading, isError, error, refetch, isRefetching } = useGetRevisionCards({
    page,
    limit: 5,
  });
  const { mutate: updateLastViewed } = useUpdateLastViewedCard();
  const { canManageContent } = useRole();

  useEffect(() => {
    if (data && Array.isArray(data.results)) {
      if (page === 1) {
        setAllCards(data.results);
      } else {
        setAllCards((prevCards) => {
          const existingIds = new Set((prevCards || []).map((c) => c._id));
          const newCards = (data.results || []).filter((c: IPopulatedRevisionCard) => !existingIds.has(c._id));
          return [...(prevCards || []), ...newCards];
        });
      }
    }
  }, [data]);

  const onRefresh = useCallback(() => {
    setPage(1);
  }, []);

  const handleLoadMore = () => {
    const canLoadMore = data && page < data.totalPages;
    if (canLoadMore && !isLoading && !isRefetching) {
      setPage((prevPage) => prevPage + 1);
    }
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems.length > 0) {
      const visibleCardId = viewableItems[0].item._id;
      // Fire-and-forget mutation to update the backend
      updateLastViewed(visibleCardId);
    }
  }, [updateLastViewed]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const renderEmptyState = () => (
    <StyledView className="flex-1 justify-center items-center bg-zinc-900" style={{ height: height * 0.8 }}>
      <StyledText className="text-white text-lg mb-2">No revision cards found.</StyledText>
      <StyledText className="text-zinc-400 text-center mb-6">Be the first to create one!</StyledText>
    </StyledView>
  );

  if (isLoading && allCards.length === 0) {
    return (
      <StyledView className="flex-1 bg-zinc-900">
        <RevisionCardSkeleton />
      </StyledView>
    );
  }

  if (isError) {
    return (
      <StyledView className="flex-1 justify-center items-center bg-zinc-900 p-4">
        <StyledText className="text-red-500 text-lg">An error occurred</StyledText>
        <StyledText className="text-red-400 mt-2 text-center">{error?.message}</StyledText>
        <StyledTouchableOpacity onPress={onRefresh} className="mt-6 bg-blue-600 px-6 py-3 rounded-lg">
          <StyledText className="text-white font-bold">Try Again</StyledText>
        </StyledTouchableOpacity>
      </StyledView>
    );
  }

  return (
    <StyledView className="flex-1 bg-zinc-900">
      <FlatList
        data={allCards}
        renderItem={({ item, index }) => (
          <StyledView style={{ height }}>
            <RevisionCard card={item} currentIndex={index} totalCount={allCards.length} />
          </StyledView>
        )}
        keyExtractor={(item) => item._id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && page === 1}
            onRefresh={onRefresh}
            tintColor="#ffffff"
          />
        }
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={() =>
          isRefetching && page > 1 ? (
            <StyledView className="h-20 justify-center items-center">
              <ActivityIndicator size="small" color="#ffffff" />
            </StyledView>
          ) : null
        }
      />

      {/* --- Floating Action Button to Create Card --- */}
      {canManageContent && (
        <StyledTouchableOpacity
          className="absolute bottom-8 right-6 bg-blue-600 w-16 h-16 rounded-full justify-center items-center shadow-lg"
          onPress={() => navigation.navigate('CreateRevision', {})}
        >
          <Plus color="#ffffff" size={32} />
        </StyledTouchableOpacity>
      )}
    </StyledView>
  );
};

export default ReelsScreen;