export interface RevisionSession {
  id: string;
  userId: string;
  playlistId?: string;
  startTime: string;
  endTime?: string;
  totalItems: number;
  itemsCompleted: number;
  isAbandoned: boolean;
  performanceRating?: number;
}