
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  async getFinancialAdvice(metrics: any) {
    // Fix: Creating a new GoogleGenAI instance right before making an API call for the most up-to-date API key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze these metrics: ${JSON.stringify(metrics)}. Provide professional feedback.`
    });
    // Fix: Accessing .text property directly as per Gemini API guidelines
    return response.text;
  }
}
