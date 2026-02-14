import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

const reportActionTypes = [
  'request-physical-audit',
  'classify-loss',
  'update-inventory-journals',
  'approve-shift-audit',
  'flag-shift-audit',
  'bulk-reminders',
  'send-payment-link',
  'escalate-legal',
  'run-sensitivity-simulation',
] as const;

export type ReportActionType = (typeof reportActionTypes)[number];

export class ReportActionDto {
  @IsString()
  @IsIn(reportActionTypes)
  action!: ReportActionType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

