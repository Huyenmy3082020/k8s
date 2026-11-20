import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * Atomically "take one" unit: only decrements when stock > 0, so the counter never goes negative.
 * Returns the remaining stock after the decrement, -1 when sold out, -2 when the key was never seeded.
 */
const TAKE_ONE_LUA = `
local s = redis.call('GET', KEYS[1])
if not s then return -2 end
s = tonumber(s)
if s > 0 then return redis.call('DECR', KEYS[1]) end
return -1
`;

export type TakeResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: 'SOLD_OUT' | 'NOT_SEEDED' };

/**
 * Redis-side stock counter. Postgres stays the source of truth;
 * Redis only arbitrates *who wins a unit* under heavy concurrency.
 */
@Injectable()
export class RedisStockService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisStockService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    this.redis.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
    this.redis.defineCommand('takeOne', { numberOfKeys: 1, lua: TAKE_ONE_LUA });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  key(productId: number) {
    return `stock:product:${productId}`;
  }

  /** Load the counter from the DB value (call before a sale / test run). */
  async seed(productId: number, stock: number) {
    await this.redis.set(this.key(productId), stock);
    this.logger.log(`Seeded ${this.key(productId)} = ${stock}`);
  }

  async get(productId: number): Promise<number | null> {
    const v = await this.redis.get(this.key(productId));
    return v === null ? null : Number(v);
  }

  async takeOne(productId: number): Promise<TakeResult> {
    const res = (await (
      this.redis as Redis & { takeOne(key: string): Promise<number> }
    ).takeOne(this.key(productId))) as number;
    if (res >= 0) return { ok: true, remaining: res };
    return { ok: false, reason: res === -2 ? 'NOT_SEEDED' : 'SOLD_OUT' };
  }

  /** Give a unit back (compensation when the DB write fails). */
  async giveBack(productId: number) {
    await this.redis.incr(this.key(productId));
  }
}
