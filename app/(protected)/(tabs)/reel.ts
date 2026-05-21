// Reel represents the interactive UI "placard" used for learning
export interface Reel {
  id: string;
  sourceProblemId?: string;
  title: string;
  category: string;
  questionText: string;
  codeSnippet?: string;
  insights?: string[];
  timeComplexity?: string;
  spaceComplexity?: string;
  pitfalls?: string[];
  mentorshipNote?: string;
}

export type Placard = Reel; // Alias for backward compatibility with current components