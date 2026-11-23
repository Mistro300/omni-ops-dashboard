import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface RateLimitCheck {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection warning: ${err.message}`);
    });
  }

  async checkRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number,
  ): Promise<RateLimitCheck> {
    try {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, windowSeconds);
      }
      const ttl = await this.client.ttl(key);
      const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;

      return {
        allowed: count <= maxRequests,
        count,
        remaining: Math.max(0, maxRequests - count),
        retryAfterSeconds,
      };
    } catch (err) {
      this.logger.warn(
        `Rate limit fallback (Redis unavailable): ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        allowed: true,
        count: 0,
        remaining: maxRequests,
        retryAfterSeconds: 0,
      };
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Redis getJson failed for ${key}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis setJson failed for ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Non-blocking SCAN-based prefix invalidation (safe for production Redis).
   */
  async invalidateByPrefix(prefix: string): Promise<number> {
    let deleted = 0;
    try {
      let cursor = '0';
      const pattern = `${prefix}*`;
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = nextCursor;
        if (keys.length > 0) {
          deleted += await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`Redis invalidateByPrefix(${prefix}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return deleted;
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      // Ignore cleanup failures if Redis is temporarily unreachable
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
