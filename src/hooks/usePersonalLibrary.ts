import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPersonalLibrary } from '@/services/progressService';

export const PERSONAL_LIBRARY_KEY = 'personalLibrary';

export const usePersonalLibrary = () => {
  return useQuery({
    queryKey: [PERSONAL_LIBRARY_KEY],
    queryFn: getPersonalLibrary,
    staleTime: 1000 * 60,
  });
};

export const useInvalidatePersonalLibrary = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [PERSONAL_LIBRARY_KEY] });
};
