import type { PopulatedUser } from '../types/folder';

export type UserRole = 'user' | 'admin' | 'superadmin';

export function getOwnerId(createdBy: PopulatedUser | string | undefined | null): string | null {
  if (!createdBy) return null;
  return typeof createdBy === 'string' ? createdBy : (createdBy._id || null);
}

export function getOwnerRole(createdBy: PopulatedUser | string | undefined | null): UserRole | undefined {
  if (!createdBy || typeof createdBy === 'string') return undefined;
  return createdBy.role;
}

export function canModifyItem(
  actorRole: UserRole | undefined | null,
  actorId: string | undefined | null,
  createdBy: PopulatedUser | string | undefined | null
): boolean {
  if (!createdBy || !actorId || !actorRole) return false;
  const ownerId = getOwnerId(createdBy);
  const ownerRole = getOwnerRole(createdBy);
  if (!ownerId) return false;

  if (actorRole === 'superadmin') return true;
  if (actorId === ownerId) return true;
  if (actorRole === 'admin' && ownerRole === 'user') return true;
  return false;
}
