export enum ProgressStatus {
  UNTOUCHED = 'UNTOUCHED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REVISION_NEEDED = 'REVISION_NEEDED'
}

export interface UserProgress {
  id: string;
  userId: string;
  problemId: string;
  status: ProgressStatus;
  lastAttemptedAt?: string;
  nextReviewAt?: string; // For Spaced Repetition logic
  confidenceScore?: number; // scale of 1-5
  attemptCount: number;
  notes?: string;
}