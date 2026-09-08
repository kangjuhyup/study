type ReminderScheduleCandidate = {
  readonly content: string;
  readonly scheduledAt: Date;
};

export class ReminderSchedulePolicy {
  canSchedule(source: ReminderScheduleCandidate, now: Date): boolean {
    return source.content.trim().length > 0 && source.scheduledAt > now;
  }
}
