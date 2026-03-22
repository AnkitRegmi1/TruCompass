import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class FileCache {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async read() {
    try {
      // The payload is stored as plain JSON so we can inspect cache contents easily.
      const fileContents = await readFile(this.filePath, "utf8");
      return JSON.parse(fileContents);
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async write(value) {
    // Create the folder on demand so the cache works in a fresh repository.
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
  }
}
