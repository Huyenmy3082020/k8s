import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { PerformanceTestRun } from './entities/performance-test-run.entity.js';
import { PerformanceTestMetric } from './entities/performance-test-metric.entity.js';
import { PerformanceTestError } from './entities/performance-test-error.entity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Map testRunId → PID of the running k6 process */
const activePids = new Map<string, number>();

interface K6Summary {
  metrics?: Record<string, K6Metric>;
  root_group?: unknown;
  options?: unknown;
}

interface K6Metric {
  type: string;
  contains?: string;
  values?: Record<string, number>;
}

/** One line of k6 --out json JSONL output */
interface K6JsonLine {
  type: string;
  metric?: string;
  data?: {
    time?: string;
    value?: number;
    tags?: Record<string, string>;
  };
}

@Injectable()
export class K6RunnerService {
  private readonly logger = new Logger(K6RunnerService.name);

  constructor(
    @InjectRepository(PerformanceTestRun)
    private readonly runRepo: Repository<PerformanceTestRun>,
    @InjectRepository(PerformanceTestMetric)
    private readonly metricRepo: Repository<PerformanceTestMetric>,
    @InjectRepository(PerformanceTestError)
    private readonly errorRepo: Repository<PerformanceTestError>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns the PID of the spawned k6 process, or null if already finished.
   * Runs entirely in the background — caller does NOT await the full run.
   */
  startRun(testRun: PerformanceTestRun): void {
    // Fire-and-forget; errors are caught internally and persisted.
    this.executeRun(testRun).catch((err: unknown) => {
      this.logger.error(
        `Unhandled error in executeRun for ${testRun.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    });
  }

  async stopRun(testRunId: string): Promise<void> {
    const pid = activePids.get(testRunId);
    if (!pid) {
      throw new NotFoundException(
        `No active k6 process found for test run ${testRunId}`,
      );
    }

    try {
      process.kill(pid, 'SIGTERM');
      this.logger.log(`Sent SIGTERM to PID ${pid} for test run ${testRunId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not kill PID ${pid}: ${msg}`);
    }
  }

  isRunning(testRunId: string): boolean {
    return activePids.has(testRunId);
  }

  // ─── Core execution ────────────────────────────────────────────────────────

  private async executeRun(testRun: PerformanceTestRun): Promise<void> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `k6-run-${testRun.id.slice(0, 8)}-`));
    const scriptPath = path.join(tmpDir, 'script.js');
    const metricsJsonlPath = path.join(tmpDir, 'metrics.jsonl');
    const summaryJsonPath = path.join(tmpDir, 'summary.json');

    this.logger.log(`Test run ${testRun.id}: temp dir = ${tmpDir}`);

    try {
      // 1. Snapshot initial stock before anything changes
      const initialStock = await this.getProductStock(testRun.productId);
      await this.runRepo.update(testRun.id, { initialStock });

      // 2. Write k6 script from template
      this.writeK6Script(testRun, scriptPath, summaryJsonPath);

      // 3. Mark as running
      const startedAt = new Date();
      await this.runRepo.update(testRun.id, { status: 'running', startedAt });

      // 4. Spawn k6
      const exitCode = await this.spawnK6(
        testRun.id,
        scriptPath,
        metricsJsonlPath,
      );

      // 5. Collect and persist results regardless of exit code
      await this.collectResults(testRun, exitCode, summaryJsonPath, metricsJsonlPath, startedAt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Test run ${testRun.id} failed: ${msg}`);
      await this.runRepo.update(testRun.id, {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: msg.slice(0, 1000),
      });
    } finally {
      activePids.delete(testRun.id);
      this.cleanupTmp(tmpDir);
    }
  }

  private writeK6Script(
    testRun: PerformanceTestRun,
    scriptPath: string,
    summaryOutputPath: string,
  ): void {
    const templatePath = path.join(
      __dirname,
      '..',
      '..',
      'k6-tests',
      'race-test-template.js',
    );

    let template = fs.readFileSync(templatePath, 'utf8');

    // Safe replacements — values come from validated DTO, not raw user input
    const escaped = summaryOutputPath.replace(/\\/g, '\\\\');

    template = template
      .replace(/__TARGET_URL__/g, testRun.targetUrl)
      .replace(/__PRODUCT_ID__/g, String(testRun.productId))
      .replace(/__VUS__/g, String(testRun.vus))
      .replace(/__ITERATIONS__/g, String(testRun.iterations))
      .replace(/__MAX_DURATION__/g, testRun.maxDuration)
      .replace(/__SUMMARY_OUTPUT_PATH__/g, escaped);

    fs.writeFileSync(scriptPath, template, 'utf8');
    this.logger.log(`Test run ${testRun.id}: script written to ${scriptPath}`);
  }

  private spawnK6(
    testRunId: string,
    scriptPath: string,
    metricsJsonlPath: string,
  ): Promise<number> {
    return new Promise((resolve) => {
      // Use spawn with separate args — NEVER shell-interpolate user input
      const k6Process = spawn(
        'k6',
        [
          'run',
          '--out', `json=${metricsJsonlPath}`,
          '--quiet',
          scriptPath,
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );

      activePids.set(testRunId, k6Process.pid!);
      this.logger.log(
        `Test run ${testRunId}: k6 spawned with PID ${k6Process.pid}`,
      );

      k6Process.stdout.on('data', (chunk: Buffer) => {
        this.logger.verbose(`[k6 stdout] ${chunk.toString().trim()}`);
      });

      k6Process.stderr.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) this.logger.debug(`[k6 stderr] ${line}`);
      });

      k6Process.on('close', (code) => {
        this.logger.log(
          `Test run ${testRunId}: k6 process exited with code ${code ?? 'null'}`,
        );
        resolve(code ?? 1);
      });

      k6Process.on('error', (err) => {
        this.logger.error(`Test run ${testRunId}: spawn error — ${err.message}`);
        resolve(1);
      });
    });
  }

  // ─── Results collection ────────────────────────────────────────────────────

  private async collectResults(
    testRun: PerformanceTestRun,
    exitCode: number,
    summaryJsonPath: string,
    metricsJsonlPath: string,
    startedAt: Date,
  ): Promise<void> {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // Was it stopped manually?
    const wasStopped = !activePids.has(testRun.id) && exitCode !== 0;
    const dbRecord = await this.runRepo.findOne({ where: { id: testRun.id } });
    const finalStatus =
      dbRecord?.status === 'stopped'
        ? 'stopped'
        : exitCode === 0
        ? 'completed'
        : wasStopped
        ? 'stopped'
        : 'failed';

    // 1. Parse summary JSON
    const summary = this.readSummaryJson(summaryJsonPath);

    // 2. Extract aggregate metrics from summary
    const agg = summary ? this.extractAggregates(summary) : null;

    // 3. Parse and persist time-series from JSONL
    const timeBuckets = this.parseMetricsJsonl(metricsJsonlPath);
    if (timeBuckets.size > 0) {
      await this.persistTimeBuckets(testRun.id, timeBuckets);
    }

    // 4. Collect inventory reconciliation
    const finalStock = await this.getProductStock(testRun.productId);
    const successfulOrderCount = await this.getSuccessfulOrderCount(testRun.productId);
    const initialStock = dbRecord?.initialStock ?? 0;
    const inventoryMismatch =
      agg !== null &&
      successfulOrderCount !== null &&
      agg.successfulRequests !== successfulOrderCount;
    const oversoldQuantity =
      initialStock != null && finalStock != null
        ? Math.max(0, initialStock - finalStock - successfulOrderCount)
        : null;

    // 5. Persist errors from JSONL
    const errors = this.extractErrors(metricsJsonlPath, testRun.id);
    if (errors.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < errors.length; i += 100) {
        await this.errorRepo.save(errors.slice(i, i + 100));
      }
    }

    // 6. Update the run record — use save() to handle jsonb column properly
    const existing = await this.runRepo.findOneOrFail({ where: { id: testRun.id } });
    Object.assign(existing, {
      status: finalStatus,
      finishedAt,
      durationMs,
      ...(agg
        ? {
            totalRequests: agg.totalRequests,
            successfulRequests: agg.successfulRequests,
            outOfStockRequests: agg.outOfStockRequests,
            unexpectedRequests: agg.unexpectedRequests,
            successRate: agg.successRate,
            errorRate: agg.errorRate,
            avgResponseTime: agg.avgResponseTime,
            medianResponseTime: agg.medianResponseTime,
            p90ResponseTime: agg.p90ResponseTime,
            p95ResponseTime: agg.p95ResponseTime,
            p99ResponseTime: agg.p99ResponseTime,
            maxResponseTime: agg.maxResponseTime,
            requestsPerSecond: agg.requestsPerSecond,
          }
        : {}),
      finalStock,
      successfulOrderCount,
      inventoryMismatch,
      oversoldQuantity,
      k6Summary: summary as Record<string, unknown> | null,
    });
    await this.runRepo.save(existing);

    this.logger.log(
      `Test run ${testRun.id}: persisted as ${finalStatus}. ` +
        `Success=${agg?.successfulRequests ?? '?'}, OOS=${agg?.outOfStockRequests ?? '?'}, ` +
        `FinalStock=${finalStock}, Orders=${successfulOrderCount}`,
    );
  }

  // ─── Summary JSON parsing ──────────────────────────────────────────────────

  private readSummaryJson(summaryJsonPath: string): K6Summary | null {
    try {
      if (!fs.existsSync(summaryJsonPath)) {
        this.logger.warn(`Summary file not found: ${summaryJsonPath}`);
        return null;
      }
      const raw = fs.readFileSync(summaryJsonPath, 'utf8');
      return JSON.parse(raw) as K6Summary;
    } catch (err: unknown) {
      this.logger.warn(
        `Could not parse summary JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private extractAggregates(summary: K6Summary) {
    const m = summary.metrics ?? {};

    const getVal = (name: string, stat: string): number | null => {
      const metric = m[name];
      if (!metric?.values) return null;
      return metric.values[stat] ?? null;
    };

    const totalRequests = Math.round(getVal('http_reqs', 'count') ?? 0);
    const successfulRequests = Math.round(getVal('buy_success', 'count') ?? 0);
    const outOfStockRequests = Math.round(getVal('buy_out_of_stock', 'count') ?? 0);
    const unexpectedRequests = Math.round(getVal('buy_unexpected', 'count') ?? 0);
    const successRate =
      totalRequests > 0
        ? parseFloat(((successfulRequests / totalRequests) * 100).toFixed(2))
        : 0;
    const errorRate =
      totalRequests > 0
        ? parseFloat(((unexpectedRequests / totalRequests) * 100).toFixed(2))
        : 0;

    const avgResponseTime = getVal('buy_response_time', 'avg');
    const medianResponseTime = getVal('buy_response_time', 'med');
    const p90ResponseTime = getVal('buy_response_time', 'p(90)');
    const p95ResponseTime = getVal('buy_response_time', 'p(95)');
    const p99ResponseTime = getVal('buy_response_time', 'p(99)');
    const maxResponseTime = getVal('buy_response_time', 'max');
    const requestsPerSecond = getVal('http_reqs', 'rate');

    return {
      totalRequests,
      successfulRequests,
      outOfStockRequests,
      unexpectedRequests,
      successRate,
      errorRate,
      avgResponseTime,
      medianResponseTime,
      p90ResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      maxResponseTime,
      requestsPerSecond,
    };
  }

  // ─── JSONL metrics parsing ─────────────────────────────────────────────────

  /**
   * Parses k6 --out json JSONL file into 1-second time buckets.
   * Returns Map<epochSecond, { duration[], status[], vus }>.
   */
  private parseMetricsJsonl(jsonlPath: string): Map<
    number,
    {
      durations: number[];
      statuses: number[];
      vus: number;
    }
  > {
    const buckets = new Map<
      number,
      { durations: number[]; statuses: number[]; vus: number }
    >();

    if (!fs.existsSync(jsonlPath)) {
      this.logger.warn(`Metrics JSONL not found: ${jsonlPath}`);
      return buckets;
    }

    const content = fs.readFileSync(jsonlPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as K6JsonLine;
        if (record.type !== 'Point' || !record.data?.time) continue;

        const epochSec = Math.floor(
          new Date(record.data.time).getTime() / 1000,
        );

        if (!buckets.has(epochSec)) {
          buckets.set(epochSec, { durations: [], statuses: [], vus: 0 });
        }
        const bucket = buckets.get(epochSec)!;

        if (
          record.metric === 'http_req_duration' &&
          record.data.value != null
        ) {
          bucket.durations.push(record.data.value);
        }

        if (
          record.metric === 'http_reqs' &&
          record.data.tags?.status != null
        ) {
          bucket.statuses.push(parseInt(record.data.tags.status, 10));
        }

        if (record.metric === 'vus' && record.data.value != null) {
          bucket.vus = Math.max(bucket.vus, record.data.value);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return buckets;
  }

  private async persistTimeBuckets(
    testRunId: string,
    buckets: Map<number, { durations: number[]; statuses: number[]; vus: number }>,
  ): Promise<void> {
    const entities: Partial<PerformanceTestMetric>[] = [];

    for (const [timestamp, bucket] of buckets) {
      const totalRequests = bucket.statuses.length;
      const successfulRequests = bucket.statuses.filter((s) => s === 201 || s === 200).length;
      const outOfStockRequests = bucket.statuses.filter((s) => s === 400).length;
      const unexpectedRequests = bucket.statuses.filter(
        (s) => s !== 200 && s !== 201 && s !== 400,
      ).length;

      const avg =
        bucket.durations.length > 0
          ? bucket.durations.reduce((a, b) => a + b, 0) / bucket.durations.length
          : null;

      const p95 =
        bucket.durations.length > 0
          ? this.percentile(bucket.durations, 95)
          : null;

      entities.push({
        testRunId,
        timestamp,
        totalRequests,
        successfulRequests,
        outOfStockRequests,
        unexpectedRequests,
        avgResponseTime: avg != null ? parseFloat(avg.toFixed(3)) : null,
        p95ResponseTime: p95 != null ? parseFloat(p95.toFixed(3)) : null,
        requestsPerSecond: totalRequests,
        activeVUs: bucket.vus,
      });
    }

    // Insert in batches
    for (let i = 0; i < entities.length; i += 200) {
      await this.metricRepo.save(entities.slice(i, i + 200));
    }
  }

  /**
   * Extracts unexpected-status events from JSONL as error records.
   * Capped at 500 entries to prevent DB bloat.
   */
  private extractErrors(
    jsonlPath: string,
    testRunId: string,
  ): Partial<PerformanceTestError>[] {
    if (!fs.existsSync(jsonlPath)) return [];

    const errors: Partial<PerformanceTestError>[] = [];
    const MAX_ERRORS = 500;

    const content = fs.readFileSync(jsonlPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      if (errors.length >= MAX_ERRORS) break;
      try {
        const record = JSON.parse(line) as K6JsonLine;
        if (record.type !== 'Point') continue;
        if (record.metric !== 'http_reqs') continue;

        const statusStr = record.data?.tags?.status;
        if (!statusStr) continue;
        const status = parseInt(statusStr, 10);

        if (status === 200 || status === 201 || status === 400) continue;

        errors.push({
          testRunId,
          timestamp: record.data?.time
            ? new Date(record.data.time).getTime()
            : Date.now(),
          statusCode: status,
          errorType: status === 0 ? 'network_error' : 'unexpected_status',
          errorMessage: `Unexpected HTTP ${status}`,
          requestUrl: record.data?.tags?.url?.slice(0, 500) ?? null,
          responseBody: null,
        });
      } catch {
        // Skip malformed lines
      }
    }

    return errors;
  }

  // ─── Database helpers ──────────────────────────────────────────────────────

  private async getProductStock(productId: number): Promise<number | null> {
    try {
      const rows = await this.dataSource.query(
        'SELECT stock FROM products WHERE id = $1',
        [productId],
      ) as { stock: number }[];
      return rows[0]?.stock ?? null;
    } catch {
      return null;
    }
  }

  private async getSuccessfulOrderCount(productId: number): Promise<number> {
    try {
      const rows = await this.dataSource.query(
        `SELECT COUNT(*) AS cnt FROM orders WHERE "productId" = $1 AND status = 'SUCCESS'`,
        [productId],
      ) as { cnt: string }[];
      return parseInt(rows[0]?.cnt ?? '0', 10);
    } catch {
      return 0;
    }
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  private cleanupTmp(tmpDir: string): void {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err: unknown) {
      this.logger.warn(
        `Could not clean up tmp dir ${tmpDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
