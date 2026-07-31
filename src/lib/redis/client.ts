import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType> | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("REDIS_URL is required in production.");
    }
    return null;
  }
  if (client?.isReady) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const next = createClient({
      url,
      socket: {
        connectTimeout: 2_000,
        reconnectStrategy: (retries) => Math.min(50 * 2 ** retries, 2_000),
      },
    });
    next.on("error", (error) => {
      console.error("[redis] client error:", error instanceof Error ? error.message : error);
    });
    await next.connect();
    client = next as RedisClientType;
    return client;
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}

export async function closeRedisClient(): Promise<void> {
  const current = client;
  client = null;
  connecting = null;
  if (current?.isOpen) await current.quit();
}
