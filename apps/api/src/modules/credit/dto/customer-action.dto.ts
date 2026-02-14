import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

const customerActions = ['bulk-reminder', 'send-payment-link', 'escalate-legal'] as const;

export type CustomerActionType = (typeof customerActions)[number];

export class CustomerActionDto {
  @IsString()
  @IsIn(customerActions)
  action!: CustomerActionType;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

