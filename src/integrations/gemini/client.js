import { requestJson } from "../../lib/http/request.js";

function extractText(response) {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

export class GeminiClient {
  constructor({ apiKey }) {
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async generateText({
    model,
    systemInstruction,
    contents,
    temperature = 0.7,
    maxOutputTokens = 400,
  }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await requestJson(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.apiKey,
      },
      json: {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens,
        },
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
      timeoutMs: 45_000,
    });

    return {
      raw: response,
      text: extractText(response),
    };
  }
}
