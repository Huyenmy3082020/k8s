import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { RequestLogsService } from '../request-logs/request-logs.service.js';
import { RedisStockService } from '../redis/redis-stock.service.js';
import type { RequestLogStatus } from '../request-logs/request-log.entity.js';
import type { BuyStrategy } from './buy-strategies.js';

const OPTIMISTIC_MAX_RETRIES = 10;

/** Filled in by a strategy while it runs, then written to request_logs */
interface Trace {
  lockAt: number | null;
  lockAcquiredAt: Date | null;
  stockBefore: number | null;
  stockAfter: number | null;
  retries: number;
}

type ProductRow = { id: number; stock: number; version: number };
type CreateOrder = (m: EntityManager) => Promise<unknown>;

@Injectable()
export class OrdersService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private readonly requestLogs: RequestLogsService,
    private readonly redisStock: RedisStockService,
  ) {}

  async buyProduct(
    productId: number,
    userId: string,
    strategy: BuyStrategy,
    testRunId: string | null,
  ) {
    const startedAt = new Date();
    const t0 = performance.now();
    const trace: Trace = {
      lockAt: null,
      lockAcquiredAt: null,
      stockBefore: null,
      stockAfter: null,
      retries: 0,
    };

    let status: RequestLogStatus = 'SUCCESS';
    let httpStatus = 201;
    let pgErrorCode: string | null = null;
    let message: string | null = null;

    const createOrder: CreateOrder = (m) =>
      m.query(
        `INSERT INTO orders ("productId", status, "testRunId", "userId")
         VALUES ($1, 'SUCCESS', $2, $3)`,
        [productId, testRunId, userId],
      );

    try {
      switch (strategy) {
        case 'no-lock':
          await this.buyNoLock(productId, trace, createOrder);
          break;
        case 'pessimistic':
          await this.buyPessimistic(productId, trace, createOrder);
          break;
        case 'optimistic':
          await this.buyOptimistic(productId, trace, createOrder);
          break;
        case 'atomic':
          await this.buyAtomic(productId, trace, createOrder);
          break;
        case 'redis':
          await this.buyRedis(productId, trace, createOrder);
          break;
      }
      return { message: 'Buy successfully', userId, productId, strategy };
    } catch (err) {
      if (err instanceof HttpException) {
        httpStatus = err.getStatus();
        status =
          err instanceof BadRequestException
            ? 'OUT_OF_STOCK'
            : err instanceof ConflictException
              ? 'CONFLICT'
              : 'ERROR';
      } else {
        httpStatus = 500;
        status = 'ERROR';
      }
      pgErrorCode = (err as { code?: string }).code ?? null;
      message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      throw err;
    } finally {
      this.requestLogs.add({
        testRunId,
        scenario: 'oversell',
        strategy,
        userId,
        productId,
        startedAt,
        lockAcquiredAt: trace.lockAcquiredAt,
        finishedAt: new Date(),
        durationMs: +(performance.now() - t0).toFixed(3),
        lockWaitMs: trace.lockAt !== null ? +(trace.lockAt - t0).toFixed(3) : null,
        stockBefore: trace.stockBefore,
        stockAfter: trace.stockAfter,
        status,
        httpStatus,
        retries: trace.retries,
        pgErrorCode,
        message,
      });
    }
  }

  // ─── Strategies ────────────────────────────────────────────────────────────

  /** BUG ON PURPOSE: read → check in app code → write computed value, no lock. */
  private async buyNoLock(productId: number, trace: Trace, createOrder: CreateOrder) {
    await this.dataSource.transaction(async (m) => {
      const product = await this.readProduct(m, productId, '');
      this.markRead(trace, product.stock);
      if (product.stock <= 0) throw new BadRequestException('Out of stock');

      // Writing back an app-computed value → concurrent requests overwrite each other.
      const newStock = product.stock - 1;
      await m.query('UPDATE products SET stock = $1 WHERE id = $2', [newStock, productId]);
      trace.stockAfter = newStock;
      await createOrder(m);
    });
  }

  private async buyPessimistic(productId: number, trace: Trace, createOrder: CreateOrder) {
    await this.dataSource.transaction(async (m) => {
      const product = await this.readProduct(m, productId, 'FOR UPDATE');
      this.markRead(trace, product.stock);
      if (product.stock <= 0) throw new BadRequestException('Out of stock');

      await m.query('UPDATE products SET stock = stock - 1 WHERE id = $1', [productId]);
      trace.stockAfter = product.stock - 1;
      await createOrder(m);
    });
  }

  private async buyOptimistic(productId: number, trace: Trace, createOrder: CreateOrder) {
    for (let attempt = 0; attempt <= OPTIMISTIC_MAX_RETRIES; attempt++) {
      trace.retries = attempt;
      const done = await this.dataSource.transaction(async (m) => {
        const product = await this.readProduct(m, productId, '');
        this.markRead(trace, product.stock);
        if (product.stock <= 0) throw new BadRequestException('Out of stock');

        const [, affected] = (await m.query(
          `UPDATE products SET stock = stock - 1, version = version + 1
            WHERE id = $1 AND version = $2`,
          [productId, product.version],
        )) as [unknown[], number];
        if (affected === 0) return false; // another request won → retry

        trace.stockAfter = product.stock - 1;
        await createOrder(m);
        return true;
      });
      if (done) return;
    }
    throw new ConflictException(`Version conflict after ${OPTIMISTIC_MAX_RETRIES} retries`);
  }

  private async buyAtomic(productId: number, trace: Trace, createOrder: CreateOrder) {
    await this.dataSource.transaction(async (m) => {
      const [rows] = (await m.query(
        `UPDATE products SET stock = stock - 1
          WHERE id = $1 AND stock > 0
          RETURNING stock`,
        [productId],
      )) as [{ stock: number }[], number];
      const row = rows[0];
      if (!row) {
        await this.readProduct(m, productId, ''); // throws 404 if product missing
        this.markRead(trace, 0);
        throw new BadRequestException('Out of stock');
      }
      this.markRead(trace, row.stock + 1);
      trace.stockAfter = row.stock;
      await createOrder(m);
    });
  }

  /**
   * Redis arbitrates who wins a unit (atomic Lua check-and-decrement);
   * only winners touch Postgres. On DB failure the unit is given back.
   */
  private async buyRedis(productId: number, trace: Trace, createOrder: CreateOrder) {
    const taken = await this.redisStock.takeOne(productId);
    if (!taken.ok) {
      this.markRead(trace, 0);
      if (taken.reason === 'NOT_SEEDED') {
        throw new ConflictException(
          `Redis stock for product ${productId} not seeded. Start the test with initialStock or seed it first.`,
        );
      }
      throw new BadRequestException('Out of stock');
    }
    this.markRead(trace, taken.remaining + 1);
    trace.stockAfter = taken.remaining;

    try {
      await this.dataSource.transaction(async (m) => {
        // Only winners reach here (<= initial stock), so contention on this row is tiny.
        const [, affected] = (await m.query(
          'UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0',
          [productId],
        )) as [unknown[], number];
        if (affected === 0) throw new Error('DB stock already 0 — Redis and DB out of sync');
        await createOrder(m);
      });
    } catch (err) {
      await this.redisStock.giveBack(productId); // compensation
      throw err;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Record the moment the row was read/locked and the stock value observed. */
  private markRead(trace: Trace, stock: number) {
    if (trace.lockAt === null) {
      trace.lockAt = performance.now();
      trace.lockAcquiredAt = new Date();
    }
    trace.stockBefore = stock;
  }

  private async readProduct(
    m: EntityManager,
    productId: number,
    lockClause: '' | 'FOR UPDATE',
  ): Promise<ProductRow> {
    const rows = (await m.query(
      `SELECT id, stock, version FROM products WHERE id = $1 ${lockClause}`,
      [productId],
    )) as ProductRow[];
    if (!rows[0]) throw new NotFoundException('Product not found');
    return rows[0];
  }
}
