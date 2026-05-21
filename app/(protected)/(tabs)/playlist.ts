export interface Playlist {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  placardIds: string[]; // References to Reel/Problem IDs
  isPublic: boolean;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}