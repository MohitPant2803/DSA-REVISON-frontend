import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/services/progressService';

export const DASHBOARD_QUERY_KEY = 'dashboardStats';

export const useDashboard = () => {
  return useQuery({
    queryKey: [DASHBOARD_QUERY_KEY],
    queryFn: getDashboardStats,
    staleTime: 1000 * 60 * 2,
  });
};
