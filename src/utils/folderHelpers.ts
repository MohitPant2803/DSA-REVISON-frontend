export function getAllDescendantFolderIds(folderId: string, foldersById: Record<string, any>): Set<string> {
  const ids = new Set<string>([folderId]);
  const queue = [folderId];
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    Object.values(foldersById).forEach((f: any) => {
      if (f && f.parentFolderId === currentId && !f.isDeleted) {
        if (!ids.has(f._id)) {
          ids.add(f._id);
          queue.push(f._id);
        }
      }
    });
  }
  
  return ids;
}
