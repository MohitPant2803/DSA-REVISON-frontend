import api from '@/services/api';
import { cacheStorage, cacheKey } from '@/lib/cache';
import type {
  CreateFolderDTO,
  IFolder,
  PaginatedFolders,
  UpdateFolderDTO,
} from '@/types/folder';

export interface QueryFoldersInput {
  page?: number;
  limit?: number;
  search?: string;
  parentFolderId?: string;
}

export const getFolders = async (params?: QueryFoldersInput): Promise<PaginatedFolders> => {
  const key = cacheKey(['folders', params?.search, params?.page]);
  try {
    const response = await api.get<PaginatedFolders>('/folders', {
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
    const cached = await cacheStorage.get<PaginatedFolders>(key);
    if (cached) return cached;
    throw error;
  }
};

export const getFolderById = async (folderId: string): Promise<IFolder> => {
  const key = cacheKey(['folder', folderId]);
  try {
    const response = await api.get<IFolder>(`/folders/${folderId}`);
    const data = response.data;
    await cacheStorage.set(key, data);
    return data;
  } catch (error) {
    const cached = await cacheStorage.get<IFolder>(key);
    if (cached) return cached;
    throw error;
  }
};

export const createFolder = async (data: CreateFolderDTO): Promise<IFolder> => {
  const response = await api.post<IFolder>('/folders', data);
  return response.data;
};

export const updateFolder = async ({
  folderId,
  updateData,
}: {
  folderId: string;
  updateData: UpdateFolderDTO;
}): Promise<IFolder> => {
  const response = await api.put<IFolder>(`/folders/${folderId}`, updateData);
  return response.data;
};

export const deleteFolder = async (folderId: string): Promise<void> => {
  await api.delete(`/folders/${folderId}`);
};
