import type { ScheduleCampaignReminderCommand } from '../../application/command/schedule-campaign-reminder.command';

export class ReminderSchedulePolicy {
  canSchedule(source: ScheduleCampaignReminderCommand, now: Date): boolean {
    return source.content.trim().length > 0 && source.scheduledAt > now;
  }
}
