import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface PushMessage {
  to: string; // FCM device token
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class PushTransport {
  private readonly logger = new Logger(PushTransport.name);
  private readonly projectId: string | undefined;
  private readonly serviceAccountKey: string | undefined;
  private cachedAccessToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.projectId = this.config.get<string>("FCM_PROJECT_ID");
    this.serviceAccountKey = this.config.get<string>(
      "FCM_SERVICE_ACCOUNT_KEY",
    );

    if (this.projectId && this.serviceAccountKey) {
      this.logger.log(
        `Push transport configured for FCM project: ${this.projectId}`,
      );
    } else {
      this.logger.warn(
        "FCM_PROJECT_ID or FCM_SERVICE_ACCOUNT_KEY not configured. Push delivery will use console logging.",
      );
    }
  }

  async send(message: PushMessage): Promise<void> {
    if (this.projectId && this.serviceAccountKey) {
      const accessToken = await this.getAccessToken();
      const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: message.to,
            notification: {
              title: message.title,
              body: message.body,
            },
            data: message.data,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new InternalServerErrorException(
          `Push delivery failed (${response.status}): ${body}`,
        );
      }

      this.logger.debug(`Push notification sent to token ${message.to.slice(0, 12)}...`);
    } else {
      // Development fallback: log to console
      this.logger.log(
        `[DEV PUSH] To: ${message.to.slice(0, 12)}... | Title: ${message.title} | Body: ${message.body}`,
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    if (
      this.cachedAccessToken &&
      Date.now() < this.cachedAccessToken.expiresAt - 60_000
    ) {
      return this.cachedAccessToken.token;
    }

    // Parse the service account key JSON
    const sa = JSON.parse(this.serviceAccountKey!);
    const now = Math.floor(Date.now() / 1000);

    // Build JWT for Google OAuth2
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");

    const { createSign } = await import("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(sa.private_key, "base64url");

    const jwt = `${header}.${payload}.${signature}`;

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      },
    );

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new InternalServerErrorException(
        `Failed to obtain FCM access token: ${body}`,
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.cachedAccessToken = {
      token: tokenData.access_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };

    return tokenData.access_token;
  }
}
