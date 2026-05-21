export interface Topic {
  id: string;
  name: string;
  slug: string;
  description?: string;
  iconName?: string;
  parentTopicId?: string; // Supports hierarchy (e.g., Trees -> BST)
}