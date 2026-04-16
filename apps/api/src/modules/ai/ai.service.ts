import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("GEMINI_API_KEY");
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    } else {
      this.logger.warn(
        "GEMINI_API_KEY not set — AI insights will be unavailable",
      );
    }
  }

  async getFinancialInsights(
    metrics: Record<string, unknown>,
  ): Promise<string> {
    if (!this.client) {
      return "AI insights unavailable — GEMINI_API_KEY not configured on the server.";
    }

    const response = await this.client.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `You are an expert financial analyst for a fuel station management company. Analyze these financial metrics and provide concise, actionable insights:\n\n${JSON.stringify(metrics, null, 2)}\n\nKeep your response under 500 words. Focus on anomalies, trends, and recommendations.`,
    });

    return response.text ?? "No insights generated.";
  }
}
