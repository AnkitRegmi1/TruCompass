export class RedisDocumentCache {
  constructor({ client, key, ttlSeconds = null }) {
    this.client = client;
    this.key = key;
    this.ttlSeconds = ttlSeconds;
  }

  async read() {
    return this.client?.get?.(this.key);
  }

  async write(value) {
    await this.client?.set?.(this.key, value, this.ttlSeconds);
  }

  async delete() {
    await this.client?.delete?.(this.key);
  }
}
