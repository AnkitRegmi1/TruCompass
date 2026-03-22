const SPECIFIC_KEYWORDS =
  /\b(fit|fits|schedule|free time|free block|available|between classes|between meetings|after class|before class|what can i make|what works for me)\b/i;

export class IntentService {
  constructor({ llmClient, model }) {
    this.llmClient = llmClient;
    this.model = model;
  }

  classifyIntent(question) {
    return SPECIFIC_KEYWORDS.test(question) ? "SPECIFIC" : "GENERAL";
  }
}
