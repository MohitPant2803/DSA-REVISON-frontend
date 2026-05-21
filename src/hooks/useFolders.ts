import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  UseQueryResult,
  UseMutationResult,
} from '@tanstack/react-query';
import * as folderService from '@/services/folderService';
import type { CreateFolderDTO, IFolder, PaginatedFolders, UpdateFolderDTO } from '@/types/folder';
import type { QueryFoldersInput } from '@/services/folderService';

const FOLDERS_QUERY_KEY = 'folders';

export const useGetFolders = (
  query?: QueryFoldersInput
): UseQueryResult<PaginatedFolders, Error> => {
  return useQuery({
    queryKey: [FOLDERS_QUERY_KEY, query],
    queryFn: () => folderService.getFolders(query),
    placeholderData: keepPreviousData,
  });
};

export const useGetFolder = (folderId: string | undefined) => {
  return useQuery({
    queryKey: [FOLDERS_QUERY_KEY, folderId],
    queryFn: () => folderService.getFolderById(folderId!),
    enabled: !!folderId,
  });
};

export const useCreateFolder = (): UseMutationResult<IFolder, Error, CreateFolderDTO> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: folderService.createFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FOLDERS_QUERY_KEY] });
    },
  });
};

export const useUpdateFolder = (): UseMutationResult<
  IFolder,
  Error,
  { folderId: string; updateData: UpdateFolderDTO }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: folderService.updateFolder,
    onMutate: async ({ folderId, updateData }) => {
      await queryClient.cancelQueries({ queryKey: [FOLDERS_QUERY_KEY] });
      const previous = queryClient.getQueriesData({ queryKey: [FOLDERS_QUERY_KEY] });
      queryClient.setQueriesData<PaginatedFolders>(
        { queryKey: [FOLDERS_QUERY_KEY] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            results: old.results.map((f) =>
              f._id === folderId ? { ...f, ...updateData } : f
            ),
          };
        }
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FOLDERS_QUERY_KEY] });
    },
  });
};

export const useDeleteFolder = (): UseMutationResult<void, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: folderService.deleteFolder,
    onMutate: async (folderId) => {
      await queryClient.cancelQueries({ queryKey: [FOLDERS_QUERY_KEY] });
      const previous = queryClient.getQueriesData({ queryKey: [FOLDERS_QUERY_KEY] });
      queryClient.setQueriesData<PaginatedFolders>(
        { queryKey: [FOLDERS_QUERY_KEY] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            results: old.results.filter((f) => f._id !== folderId),
            totalResults: Math.max(0, old.totalResults - 1),
          };
        }
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FOLDERS_QUERY_KEY] });
    },
  });
};
