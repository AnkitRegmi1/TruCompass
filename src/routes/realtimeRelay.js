import { WebSocketServer, WebSocket } from "ws";
import { DAILY_CONCIERGE_REALTIME_PROMPT } from "../services/concierge/dailyConciergePrompt.js";

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const SESSION_CONFIG = {
  modalities: ["text", "audio"],
  instructions: DAILY_CONCIERGE_REALTIME_PROMPT,
  voice: "coral",
  input_audio_format: "pcm16",
  output_audio_format: "pcm16",
  input_audio_transcription: { model: "whisper-1" },
  turn_detection: {
    type: "server_vad",
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 600,
  },
  tools: [
    {
      type: "function",
      name: "truman_concierge_lookup",
      description:
        "Look up current campus events, dining menus, Rec hours and occupancy, athletics schedules, newsletter updates, or schedule-fit recommendations for Truman State University students.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The student question exactly as spoken",
          },
        },
        required: ["question"],
      },
    },
  ],
  tool_choice: "auto",
};

export function attachRealtimeRelay(
  httpServer,
  { apiKey, conciergeService, defaultTimeZone },
) {
  if (!apiKey) {
    console.warn("[Realtime Relay] No OpenAI API key — relay disabled.");
    return;
  }

  const wss = new WebSocketServer({ server: httpServer, path: "/api/realtime" });

  wss.on("connection", (clientWs) => {
    const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiWs.on("open", () => {
      openaiWs.send(
        JSON.stringify({ type: "session.update", session: SESSION_CONFIG }),
      );
    });

    openaiWs.on("message", async (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (event.type === "response.function_call_arguments.done") {
        let output;
        try {
          const args = JSON.parse(event.arguments ?? "{}");
          const result = await conciergeService.respond({
            question: args.question ?? "",
            timeZone: defaultTimeZone,
            includeAudio: false,
          });
          output = result.textResponse ?? "No information available right now.";
        } catch (err) {
          console.error("[Realtime Relay] Tool call error:", err.message);
          output = "I could not fetch campus data right now. Please try again.";
        }

        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.call_id,
                output,
              },
            }),
          );
          openaiWs.send(JSON.stringify({ type: "response.create" }));
        }
        return;
      }

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(raw);
      }
    });

    clientWs.on("message", (raw) => {
      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(raw);
      }
    });

    clientWs.on("close", () => {
      if (openaiWs.readyState !== WebSocket.CLOSED) openaiWs.close();
    });

    openaiWs.on("close", () => {
      if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close();
    });

    openaiWs.on("error", (err) => {
      console.error("[Realtime Relay] OpenAI WS error:", err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", error: { message: err.message } }));
        clientWs.close();
      }
    });

    clientWs.on("error", (err) => {
      console.error("[Realtime Relay] Client WS error:", err.message);
      if (openaiWs.readyState !== WebSocket.CLOSED) openaiWs.close();
    });
  });

  console.log("[Realtime Relay] Attached at ws://[host]/api/realtime");
}
