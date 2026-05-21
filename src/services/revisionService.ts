import api from '@/services/api';
import { cacheStorage, cacheKey } from '@/lib/cache';
import type {
  CreateRevisionCardDTO,
  IPopulatedRevisionCard,
  PaginatedRevisionCards,
  UpdateRevisionCardDTO,
} from '@/types/revision';

export interface QueryRevisionCardsInput {
  page?: number;
  limit?: number;
  search?: string;
  topic?: string;
  difficulty?: string;
  folderId?: string;
  tags?: string;
  sort?: string;
}

export const getRevisionCards = async (
  params: QueryRevisionCardsInput
): Promise<PaginatedRevisionCards> => {
  const key = cacheKey([
    'cards',
    params.folderId,
    params.page,
    params.search,
    params.topic,
    params.difficulty,
    params.tags,
  ]);
  try {
    const response = await api.get<PaginatedRevisionCards>('/revisions', {
      params: {
        ...params,
        page: params.page?.toString(),
        limit: params.limit?.toString(),
      },
    });
    const data = response.data;
    await cacheStorage.set(key, data);
    return data;
  } catch (error) {
    const cached = await cacheStorage.get<PaginatedRevisionCards>(key);
    if (cached) return cached;
    throw error;
  }
};

export const getRevisionCardById = async (cardId: string): Promise<IPopulatedRevisionCard> => {
  const response = await api.get<IPopulatedRevisionCard>(`/revisions/${cardId}`);
  return response.data;
};

export const getCardsByFolder = async (
  folderId: string,
  params?: QueryRevisionCardsInput
): Promise<PaginatedRevisionCards> => {
  const key = cacheKey(['cards_folder', folderId, params?.page, params?.search, params?.topic]);
  try {
    const response = await api.get<PaginatedRevisionCards>(`/revisions/folder/${folderId}`, {
      params: {
        ...params,
        page: params?.page?.toString(),
        limit: params?.limit?.toString(),
      },
    });
    const data = response.data;
    await cacheStorage.set(key, data);
    return data;
  } catch (error) {
    const cached = await cacheStorage.get<PaginatedRevisionCards>(key);
    if (cached) return cached;
    throw error;
  }
};

export const createRevisionCard = async (cardData: CreateRevisionCardDTO) => {
  const response = await api.post('/revisions', cardData);
  return response.data;
};

export const updateRevisionCard = async ({
  cardId,
  updateData,
}: {
  cardId: string;
  updateData: UpdateRevisionCardDTO;
}) => {
  const response = await api.put(`/revisions/${cardId}`, updateData);
  return response.data;
};

export const deleteRevisionCard = async (cardId: string) => {
  await api.delete(`/revisions/${cardId}`);
};
