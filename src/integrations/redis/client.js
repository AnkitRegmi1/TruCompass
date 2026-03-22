import { Redis } from "@upstash/redis";

function safeJsonParse(value) {
  if (value == null || typeof value !== "string") {
    return value ?? null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export class RedisClient {
  constructor({ url, token, keyPrefix = "trucompass" } = {}) {
    this.keyPrefix = keyPrefix;
    this.client = url && token ? new Redis({ url, token }) : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  #withPrefix(key) {
    return `${this.keyPrefix}:${key}`;
  }

  async get(key) {
    if (!this.client) {
      return null;
    }

    const value = await this.client.get(this.#withPrefix(key));
    return safeJsonParse(value);
  }

  async set(key, value, ttlSeconds = null) {
    if (!this.client) {
      return;
    }

    const serialized = JSON.stringify(value);

    if (ttlSeconds && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      await this.client.set(this.#withPrefix(key), serialized, { ex: ttlSeconds });
      return;
    }

    await this.client.set(this.#withPrefix(key), serialized);
  }

  async delete(key) {
    if (!this.client) {
      return;
    }

    await this.client.del(this.#withPrefix(key));
  }
}
