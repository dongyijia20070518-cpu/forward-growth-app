export type Profile = { email: string; nickname: string; firstCaptureCompleted: boolean };
export type Project = { id: string; title: string; why: string; currentState: string; nextStep: string; status: string; accent: string; updatedAt: string };
export type Task = { id: string; title: string; notes: string; tier: string; status: string; dueDate: string; carryCount: number; progressText: string; projectId: string | null; createdAt: string; completedAt: string | null };
export type Capture = { id: string; body: string; category: string; secondaryType: string | null; topic: string | null; confidence: number; reason: string; createdAt: string };
export type ProgressEvent = { id: string; projectId: string; body: string; createdAt: string };
export type Skill = { id: string; name: string; level: string; evidence: string; updatedAt: string };
export type Review = { id: string; periodKind: string; periodLabel: string; reflection: string; createdAt: string };
export type AppState = {
  profile: Profile | null;
  projects: Project[];
  tasks: Task[];
  captures: Capture[];
  progressEvents: ProgressEvent[];
  skills: Skill[];
  reviews: Review[];
  localDate: string;
  syncedAt: string;
};
