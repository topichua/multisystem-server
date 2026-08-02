export const INSTAGRAM_SYNCHRONIZATION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

export type InstagramSynchronizationStatus =
  (typeof INSTAGRAM_SYNCHRONIZATION_STATUSES)[number];

export const INSTAGRAM_SYNCHRONIZATION_PHASES = [
  "conversations",
  "messages",
  "done",
] as const;

export type InstagramSynchronizationPhase =
  (typeof INSTAGRAM_SYNCHRONIZATION_PHASES)[number];
