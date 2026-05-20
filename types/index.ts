export interface Placard {
  id: string;
  title: string;
  topic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  questionText: string;
  mcqOptions?: string[];
  codeSnippet?: string;
  sheetId: string;
  isCompleted: boolean;
}

export interface Sheet {
  id: string;
  title: string;
  description: string;
  totalQuestions: number;
  completedQuestions: number;
}

export interface PersonalFolder {
  id: string;
  name: string;
  totalQuestions: number;
  lastUpdated: string;
  progress: number;
}