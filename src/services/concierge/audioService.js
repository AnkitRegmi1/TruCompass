import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export class AudioService {
  constructor({ openAiClient, model, voice }) {
    this.openAiClient = openAiClient;
    this.model = model;
    this.voice = voice;
  }

  async synthesize(text) {
    if (!this.openAiClient.isConfigured()) {
      return null;
    }

    const audioBuffer = await this.openAiClient.createSpeech({
      model: this.model,
      voice: this.voice,
      input: text,
      instructions:
        "Speak like a warm, upbeat Truman State campus guide. Keep the delivery natural and clear.",
    });

    const fileName = `concierge-${Date.now()}.mp3`;
    const outputDirectory = resolve("data/audio");
    const outputPath = resolve(outputDirectory, fileName);

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(outputPath, audioBuffer);

    return {
      fileName,
      path: outputPath,
      url: `/audio/${fileName}`,
      disclosure: "This voice output is AI-generated.",
    };
  }
}
