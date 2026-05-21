import type { PopulatedUser } from '../types/folder';

export type UserRole = 'user' | 'admin' | 'superadmin';

export function getOwnerId(createdBy: PopulatedUser | string): string {
  return typeof createdBy === 'string' ? createdBy : createdBy._id;
}

export function getOwnerRole(createdBy: PopulatedUser | string): UserRole | undefined {
  return typeof createdBy === 'string' ? undefined : createdBy.role;
}

export function canModifyItem(
  actorRole: UserRole,
  actorId: string,
  createdBy: PopulatedUser | string
): boolean {
  const ownerId = getOwnerId(createdBy);
  const ownerRole = getOwnerRole(createdBy);

  if (actorRole === 'superadmin') return true;
  if (actorId === ownerId) return true;
  if (actorRole === 'admin' && ownerRole === 'user') return true;
  return false;
}
