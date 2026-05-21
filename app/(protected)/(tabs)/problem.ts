export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD'
}

export interface Problem {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  content: string; // Markdown or structured data
  topicIds: string[];
  hints?: string[];
  externalUrl?: string; // Link to LeetCode/GFG
  baseComplexity?: ComplexityAnalysis;
  updatedAt: string;
}

export interface ComplexityAnalysis {
  time: string; // e.g., "O(N log N)"
  space: string; // e.g., "O(1)"
  explanation?: string;
}