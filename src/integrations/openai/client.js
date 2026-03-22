import { requestBinary, requestJson } from "../../lib/http/request.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const STREAM_TIMEOUT_MS = 60_000;

function buildReasoningConfig(model) {
  if (model === "gpt-5" || model.startsWith("gpt-5-")) {
    return { effort: "minimal" };
  }

  if (
    model.startsWith("gpt-5.1") ||
    model.startsWith("gpt-5.2") ||
    model.startsWith("gpt-5.4")
  ) {
    return { effort: "none" };
  }

  return undefined;
}

function extractOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const textParts = [];

  for (const item of response.output ?? []) {
    for (const contentItem of item.content ?? []) {
      if (contentItem.text) {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

export class OpenAiClient {
  constructor({ apiKey }) {
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async createTextResponse({ model, systemPrompt, userPrompt, maxOutputTokens }) {
    const executeRequest = async (tokenLimit) =>
      requestJson(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        json: {
          model,
          max_output_tokens: tokenLimit,
          ...(buildReasoningConfig(model)
            ? { reasoning: buildReasoningConfig(model) }
            : {}),
          text: {
            format: {
              type: "text",
            },
            verbosity: "low",
          },
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: systemPrompt }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: userPrompt }],
            },
          ],
        },
        timeoutMs: 45_000,
      });

    let response = await executeRequest(maxOutputTokens);
    let text = extractOutputText(response);

    if (
      !text &&
      response.incomplete_details?.reason === "max_output_tokens"
    ) {
      response = await executeRequest(maxOutputTokens * 4);
      text = extractOutputText(response);
    }

    return {
      raw: response,
      text,
    };
  }

  async generateText({
    model,
    systemInstruction,
    contents,
    maxOutputTokens,
  }) {
    const userPrompt = (contents ?? [])
      .map((content) => {
        const role = content.role === "model" ? "assistant" : content.role;
        const text = (content.parts ?? [])
          .map((part) => part.text ?? "")
          .join("\n")
          .trim();

        return `${role.toUpperCase()}:\n${text}`;
      })
      .join("\n\n");

    return this.createTextResponse({
      model,
      systemPrompt: systemInstruction,
      userPrompt,
      maxOutputTokens,
    });
  }

  async *streamTextResponse({ model, systemPrompt, userPrompt, maxOutputTokens }) {
    const body = {
      model,
      stream: true,
      max_output_tokens: maxOutputTokens,
      ...(buildReasoningConfig(model) ? { reasoning: buildReasoningConfig(model) } : {}),
      text: { format: { type: "text" } },
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `OpenAI streaming request failed with status ${response.status}: ${errorText}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("event:") || trimmed.startsWith(":")) continue;
          if (!trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6).trim();
          if (data === "[DONE]") return;

          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          if (parsed.type === "response.output_text.delta" && parsed.delta) {
            yield { type: "delta", text: parsed.delta };
          } else if (parsed.type === "error") {
            throw new Error(parsed.message ?? "OpenAI streaming error");
          } else if (parsed.type === "response.completed") {
            return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async *generateTextStream({ model, systemInstruction, contents, maxOutputTokens }) {
    const userPrompt = (contents ?? [])
      .map((content) => {
        const role = content.role === "model" ? "assistant" : content.role;
        const text = (content.parts ?? [])
          .map((part) => part.text ?? "")
          .join("\n")
          .trim();
        return `${role.toUpperCase()}:\n${text}`;
      })
      .join("\n\n");

    yield* this.streamTextResponse({
      model,
      systemPrompt: systemInstruction,
      userPrompt,
      maxOutputTokens,
    });
  }

  async createSpeech({ model, voice, input, instructions }) {
    return requestBinary(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        input,
        instructions,
      }),
      timeoutMs: 60_000,
    });
  }
}
