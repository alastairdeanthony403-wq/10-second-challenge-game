export type AnalyticsEvent =
  | { name: 'ChallengeStarted'; gameId: string; difficulty: number; modifier: string | null }
  | { name: 'ChallengeCompleted'; gameId: string; score: number }
  | { name: 'ChallengeFailed'; gameId: string; score: number; reason: string | undefined }
  | { name: 'PerfectScore'; gameId: string }
  | { name: 'RunCompleted'; mode: string; points: number; rounds: number }
  | { name: 'AchievementUnlocked'; id: string };

/** Optional telemetry sink. The game runs identically with the no-op implementation. */
export interface AnalyticsService {
  track(event: AnalyticsEvent): void;
}

export class NoopAnalytics implements AnalyticsService {
  track(): void {}
}

/** Keeps the last events in memory (shown in the debug menu); never sends data anywhere. */
export class DebugAnalytics implements AnalyticsService {
  readonly events: (AnalyticsEvent & { time: number })[] = [];
  track(event: AnalyticsEvent): void {
    this.events.push({ ...event, time: Date.now() });
    if (this.events.length > 100) this.events.shift();
  }
}
