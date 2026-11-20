import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestLog } from './request-log.entity.js';

const FLUSH_INTERVAL_MS = 500;
const BATCH_SIZE = 1000;

/**
 * Buffers request logs in memory and writes them in batches so that
 * logging doesn't distort the latency we are trying to measure.
 */
@Injectable()
export class RequestLogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestLogsService.name);
  private buffer: Partial<RequestLog>[] = [];
  private timer?: NodeJS.Timeout;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(RequestLog)
    private readonly repo: Repository<RequestLog>,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.flush();
  }

  add(log: Partial<RequestLog>) {
    this.buffer.push(log);
  }

  /** Flush everything currently buffered; safe to call concurrently. */
  flush(): Promise<void> {
    this.flushing = this.flushing.then(async () => {
      while (this.buffer.length > 0) {
        const batch = this.buffer.splice(0, BATCH_SIZE);
        try {
          await this.repo.insert(batch);
        } catch (err) {
          this.logger.error(
            `Failed to insert ${batch.length} request logs: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
    return this.flushing;
  }

  async findByRun(
    testRunId: string,
    opts: { status?: string; page: number; limit: number },
  ) {
    const qb = this.repo
      .createQueryBuilder('l')
      .where('l.testRunId = :testRunId', { testRunId })
      .orderBy('l.startedAt', 'ASC')
      .addOrderBy('l.id', 'ASC')
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit);
    if (opts.status) qb.andWhere('l.status = :status', { status: opts.status });
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: opts.page, limit: opts.limit };
  }

  /**
   * Race evidence: stock values that more than one *successful* request observed.
   * With correct locking every success sees a distinct stock value.
   */
  async duplicateReads(testRunId: string) {
    const rows = (await this.repo.query(
      `SELECT "stockBefore" AS stock, COUNT(*)::int AS count
         FROM request_logs
        WHERE "testRunId" = $1 AND status = 'SUCCESS' AND "stockBefore" IS NOT NULL
        GROUP BY "stockBefore"
       HAVING COUNT(*) > 1
        ORDER BY "stockBefore" DESC`,
      [testRunId],
    )) as { stock: number; count: number }[];
    return rows;
  }

  async summary(testRunId: string) {
    const rows = (await this.repo.query(
      `SELECT status, COUNT(*)::int AS count,
              AVG("durationMs")::float AS "avgDurationMs",
              AVG("lockWaitMs")::float AS "avgLockWaitMs",
              MAX("lockWaitMs")::float AS "maxLockWaitMs",
              SUM(retries)::int AS retries
         FROM request_logs WHERE "testRunId" = $1
        GROUP BY status`,
      [testRunId],
    )) as Record<string, unknown>[];
    return rows;
  }

  deleteByRun(testRunId: string) {
    return this.repo.delete({ testRunId });
  }
}
