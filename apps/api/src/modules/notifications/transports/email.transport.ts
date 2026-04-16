import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class EmailTransport {
  private readonly logger = new Logger(EmailTransport.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST");
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>("SMTP_PORT", 587),
        secure: this.config.get<boolean>("SMTP_SECURE", false),
        auth: {
          user: this.config.get<string>("SMTP_USER"),
          pass: this.config.get<string>("SMTP_PASS"),
        },
      });
      this.logger.log(`Email transport configured with SMTP host: ${host}`);
    } else {
      this.logger.warn(
        "SMTP_HOST not configured. Email delivery will use console logging.",
      );
    }
  }

  async send(message: EmailMessage): Promise<void> {
    const from = this.config.get<string>("SMTP_FROM", "noreply@ifms.local");

    if (this.transporter) {
      await this.transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.body,
        html: message.html,
      });
      this.logger.debug(`Email sent to ${message.to}: ${message.subject}`);
    } else {
      // Development fallback: log to console
      this.logger.log(
        `[DEV EMAIL] To: ${message.to} | Subject: ${message.subject} | Body: ${message.body}`,
      );
    }
  }
}
