export type FolderVisibility = 'public' | 'private';
export type RoleAccess = 'user' | 'admin' | 'superadmin';

export interface PopulatedUser {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  role?: RoleAccess;
}

export interface IFolder {
  _id: string;
  title: string;
  description?: string;
  icon: string;
  color: string;
  createdBy: PopulatedUser | string;
  visibility: FolderVisibility;
  roleAccess: RoleAccess[];
  order: number;
  parentFolderId?: string | null;
  cardCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateFolderDTO = {
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  visibility?: FolderVisibility;
  roleAccess?: RoleAccess[];
  order?: number;
  parentFolderId?: string | null;
};

export type UpdateFolderDTO = Partial<CreateFolderDTO>;

export interface PaginatedFolders {
  results: IFolder[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}
