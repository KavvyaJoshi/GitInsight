import { Redis } from 'ioredis';
import { config } from '../config';

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec: number): Promise<void>;
}

class MemoryCache implements Cache {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    this.store.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSec * 1000 });
  }
}

// A cache outage must never break a request, so Redis failures behave like misses.
class RedisCache implements Cache {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch {
      // Ignored: the next request simply refetches.
    }
  }
}

export let cache: Cache = new MemoryCache();

export function initCache(url = config.redisUrl): void {
  if (url) {
    cache = new RedisCache(new Redis(url, { maxRetriesPerRequest: 2 }));
  } else if (!config.isTest) {
    console.warn('REDIS_URL not set: using in-process cache');
  }
}

export function resetCache(): void {
  cache = new MemoryCache();
}
