const SCHEDULING_KEYWORDS =
  /\b(schedule|meeting|book|calendar|appointment|remind me|add to calendar|put on my calendar|set up)\b/i;
const CREATE_CONFIRMATION_PATTERN =
  /\b(yes|yeah|yep|create|tap create|create it|do it|go ahead|confirm|book it|schedule it|add it|make it)\b/i;

function emptyDraft() {
  return {
    requested: false,
    readyToCreate: false,
    title: "",
    description: "",
    location: "",
    startDateTime: "",
    endDateTime: "",
    missingFields: [],
    clarification: "",
  };
}

export class MeetingDraftService {
  constructor({ llmClient, model, defaultTimeZone }) {
    this.llmClient = llmClient;
    this.model = model;
    this.defaultTimeZone = defaultTimeZone;
  }

  isSchedulingRequest(text) {
    return SCHEDULING_KEYWORDS.test(text ?? "");
  }

  isCreateConfirmation(text) {
    return CREATE_CONFIRMATION_PATTERN.test(text ?? "");
  }

  async buildDraft({ question, conversationMessages, currentDate }) {
    const shouldBuildFromConversation =
      this.isSchedulingRequest(question) || this.isCreateConfirmation(question);

    if (!shouldBuildFromConversation) {
      return emptyDraft();
    }

    if (!this.llmClient.isConfigured()) {
      return {
        ...emptyDraft(),
        requested: true,
        clarification:
          "I can help create a calendar event, but I need the title, date, start time, and end time.",
      };
    }

    const result = await this.llmClient.generateText({
      model: this.model,
      maxOutputTokens: 220,
      systemInstruction:
        "Extract a calendar event draft from the conversation. Return only valid JSON with keys: requested, readyToCreate, title, description, location, startDateTime, endDateTime, missingFields, clarification. Resolve relative dates using the provided current date and output ISO datetime strings. If details are missing, set readyToCreate false and explain what is missing in clarification.",
      contents: [
        ...(conversationMessages ?? []).map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.text }],
        })),
        {
          role: "user",
          parts: [
            {
              text: `Current date: ${currentDate}\nTime zone: ${this.defaultTimeZone}\nLatest request: ${question}`,
            },
          ],
        },
      ],
    });

    try {
      const draft = JSON.parse(result.text);

      return {
        ...emptyDraft(),
        ...draft,
        requested: Boolean(draft.requested ?? true),
      };
    } catch {
      return {
        ...emptyDraft(),
        requested: true,
        clarification:
          "I think you want to create a calendar event, but I still need a cleaner title, date, and time range.",
      };
    }
  }
}
