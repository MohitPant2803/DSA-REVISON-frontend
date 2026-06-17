import { useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as folderService from '@/services/folderService';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import type { CreateFolderDTO, IFolder, PaginatedFolders, UpdateFolderDTO } from '@/types/folder';
import type { QueryFoldersInput } from '@/services/folderService';

// 1. Local-First Hybrid Read hook for Folders
export const useGetFolders = (query?: QueryFoldersInput) => {
  const foldersById = usePlaylistStateStore((s) => s.foldersById);
  const hydrateFolders = usePlaylistStateStore((s) => s.hydrateFolders);
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');

  const folderList = useMemo(() => {
    let list = Object.values(foldersById);

    // Parent folder filter
    if (query?.parentFolderId) {
      if (query.parentFolderId === 'null') {
        list = list.filter((f) => !f.parentFolderId);
      } else {
        list = list.filter((f) => f.parentFolderId === query.parentFolderId);
      }
    } else {
      list = list.filter((f) => !f.parentFolderId);
    }

    // Search filter
    if (query?.search) {
      const s = query.search.toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(s) || f.description?.toLowerCase().includes(s));
    }

    // Sort by order and createdAt
    return list.sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [foldersById, query?.parentFolderId, query?.search]);

  const queryResult = useQuery({
    queryKey: ['folders', query],
    queryFn: async () => {
      return {
        results: folderList,
        page: 1,
        limit: 100,
        totalPages: 1,
        totalResults: folderList.length,
      } as PaginatedFolders;
    },
    enabled: false,
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);

  return {
    data: {
      results: folderList,
      page: 1,
      limit: 100,
      totalPages: 1,
      totalResults: folderList.length,
    } as PaginatedFolders,
    isLoading: !hasHydrated,
    isError: false,
    error: null,
    refetch: async () => {
      try {
        const { syncManager } = require('@/utils/syncManager');
        await syncManager.sync(true);
      } catch (err) {
        console.warn('[useGetFolders] Refetch sync failed:', err);
      }
      return queryResult.refetch();
    },
    isRefetching: queryResult.isRefetching,
  };
};

export const useGetFolder = (folderId: string | undefined) => {
  const folder = usePlaylistStateStore((s) => folderId ? s.foldersById[folderId] : undefined);
  const hydrateFolders = usePlaylistStateStore((s) => s.hydrateFolders);
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');

  const queryResult = useQuery({
    queryKey: ['folders', folderId],
    queryFn: async () => {
      return folder || null;
    },
    enabled: false,
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);

  return {
    data: folder || null,
    isLoading: !hasHydrated && !folder,
    isError: false,
    error: null,
    refetch: async () => {
      try {
        const { syncManager } = require('@/utils/syncManager');
        await syncManager.sync(true);
      } catch (err) {
        console.warn('[useGetFolder] Refetch sync failed:', err);
      }
      return queryResult.refetch();
    },
  };
};

// 2. Optimistic Mutation hooks
export const useCreateFolder = () => {
  const createFolderInStore = usePlaylistStateStore((s) => s.createFolderInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (dto: CreateFolderDTO) => {
      const uuid = Crypto.randomUUID();
      
      const folder: IFolder = {
        _id: uuid,
        title: dto.title,
        description: dto.description || '',
        icon: dto.icon || 'Folder',
        color: dto.color || '#8B5CF6',
        createdBy: user 
          ? { _id: user.id, name: user.name, email: user.email, role: user.role } 
          : { _id: 'guest', name: 'Guest', email: '' },
        visibility: dto.visibility || 'public',
        roleAccess: dto.roleAccess || ['user'],
        order: dto.order || 0,
        parentFolderId: dto.parentFolderId || null,
        cardCount: 0,
        hasSubfolders: false,
        cardIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Optimistic Update Local Zustand Store immediately
      createFolderInStore(folder);

      // 2. Enqueue offline action with unique client-side actionId
      enqueueOfflineAction({
        action: 'CREATE_FOLDER',
        payload: { folderId: uuid, dto: { ...dto, _id: uuid } },
        timestamp: Date.now(),
      });

      return Promise.resolve(folder);
    },
  });
};

export const useUpdateFolder = () => {
  const updateFolderInStore = usePlaylistStateStore((s) => s.updateFolderInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async ({ folderId, updateData }: { folderId: string; updateData: UpdateFolderDTO }) => {
      // 1. Optimistic Update Local Zustand Store immediately
      updateFolderInStore(folderId, updateData);

      // 2. Enqueue offline action
      enqueueOfflineAction({
        action: 'UPDATE_FOLDER',
        payload: { folderId, updateData },
        timestamp: Date.now(),
      });

      return Promise.resolve({ _id: folderId, ...updateData } as IFolder);
    },
  });
};

export const useDeleteFolder = () => {
  const deleteFolderInStore = usePlaylistStateStore((s) => s.deleteFolderInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async (folderId: string) => {
      // 1. Optimistic Delete Local Zustand Store immediately
      deleteFolderInStore(folderId);

      // 2. Enqueue offline action
      enqueueOfflineAction({
        action: 'DELETE_FOLDER',
        payload: { folderId },
        timestamp: Date.now(),
      });

      return Promise.resolve();
    },
  });
};
