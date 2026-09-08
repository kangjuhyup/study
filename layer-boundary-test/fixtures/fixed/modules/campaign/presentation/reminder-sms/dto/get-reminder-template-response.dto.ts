type ReminderTemplateSource = {
  readonly code: string;
  readonly content: string;
  readonly buttonLabel: string;
};

export class GetReminderTemplateResponseDto {
  readonly code: string;
  readonly content: string;
  readonly buttonLabel: string;

  constructor(source: ReminderTemplateSource) {
    this.code = source.code;
    this.content = source.content;
    this.buttonLabel = source.buttonLabel;
  }

  static of(source: ReminderTemplateSource) {
    return new GetReminderTemplateResponseDto(source);
  }
}
