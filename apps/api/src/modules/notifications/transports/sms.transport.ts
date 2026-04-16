import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface SmsMessage {
  to: string;
  message: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class SmsTransport {
  private readonly logger = new Logger(SmsTransport.name);
  private readonly providerUrl: string | undefined;
  private readonly apiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.providerUrl = this.config.get<string>("SMS_PROVIDER_URL");
    this.apiKey = this.config.get<string>("SMS_API_KEY");

    if (this.providerUrl) {
      this.logger.log(
        `SMS transport configured with provider: ${this.providerUrl}`,
      );
    } else {
      this.logger.warn(
        "SMS_PROVIDER_URL not configured. SMS delivery will use console logging.",
      );
    }
  }

  async send(sms: SmsMessage): Promise<void> {
    if (this.providerUrl && this.apiKey) {
      const response = await fetch(this.providerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          to: sms.to,
          message: sms.message,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new InternalServerErrorException(`SMS delivery failed (${response.status}): ${body}`);
      }

      this.logger.debug(`SMS sent to ${sms.to}`);
    } else {
      // Development fallback: log to console
      this.logger.log(`[DEV SMS] To: ${sms.to} | Message: ${sms.message}`);
    }
  }
}
