import type { ReminderTemplateView } from '../../../application/query/dto/response/reminder-template.view';

export class GetReminderTemplateResponseDto {
  readonly code: string;
  readonly content: string;
  readonly buttonLabel: string;

  constructor(source: ReminderTemplateView) {
    this.code = source.code;
    this.content = source.content;
    this.buttonLabel = source.buttonLabel;
  }

  static of(source: ReminderTemplateView) {
    return new GetReminderTemplateResponseDto(source);
  }
}
