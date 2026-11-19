import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindOptionsWhere,
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
} from 'typeorm';
import { PerformanceTestRun } from './entities/performance-test-run.entity.js';
import { PerformanceTestMetric } from './entities/performance-test-metric.entity.js';
import { PerformanceTestError } from './entities/performance-test-error.entity.js';
import { K6RunnerService } from './k6-runner.service.js';
import { CreatePerformanceTestDto } from './dto/create-performance-test.dto.js';
import { QueryPerformanceTestsDto } from './dto/query-performance-tests.dto.js';

/** Hard limits applied regardless of DTO values */
const MAX_DURATION_SECONDS = 30 * 60; // 30 minutes

@Injectable()
export class PerformanceTestsService {
  private readonly logger = new Logger(PerformanceTestsService.name);

  constructor(
    @InjectRepository(PerformanceTestRun)
    private readonly runRepo: Repository<PerformanceTestRun>,
    @InjectRepository(PerformanceTestMetric)
    private readonly metricRepo: Repository<PerformanceTestMetric>,
    @InjectRepository(PerformanceTestError)
    private readonly errorRepo: Repository<PerformanceTestError>,
    private readonly k6Runner: K6RunnerService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async createTest(dto: CreatePerformanceTestDto): Promise<PerformanceTestRun> {
    // Guard: only one test at a time
    const running = await this.runRepo.findOne({
      where: { status: 'running' },
    });
    if (running) {
      throw new ConflictException(
        `Test run ${running.id} is currently running. Stop it before starting a new one.`,
      );
    }

    const pending = await this.runRepo.findOne({
      where: { status: 'pending' },
    });
    if (pending) {
      throw new ConflictException(
        `Test run ${pending.id} is pending. Wait for it to start.`,
      );
    }

    // Enforce hard duration cap
    this.validateDuration(dto.maxDuration);

    const testRun = this.runRepo.create({
      productId: dto.productId,
      testType: dto.testType ?? 'concurrent',
      targetUrl: dto.targetUrl,
      vus: dto.vus,
      iterations: dto.iterations,
      maxDuration: dto.maxDuration,
      status: 'pending',
    });

    const saved = await this.runRepo.save(testRun);
    this.logger.log(`Created test run ${saved.id} (${saved.testType})`);

    // If initialStock was provided, update the product stock before running
    if (dto.initialStock !== undefined) {
      await this.resetProductStock(dto.productId, dto.initialStock);
      this.logger.log(
        `Reset product ${dto.productId} stock to ${dto.initialStock}`,
      );
    }

    // Start k6 asynchronously — do not await
    this.k6Runner.startRun(saved);

    return saved;
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async listTests(query: QueryPerformanceTestsDto): Promise<{
    data: PerformanceTestRun[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: FindOptionsWhere<PerformanceTestRun> = {};

    if (query.status) where.status = query.status;
    if (query.productId) where.productId = query.productId;

    if (query.dateFrom && query.dateTo) {
      where.createdAt = Between(
        new Date(query.dateFrom),
        new Date(query.dateTo),
      );
    } else if (query.dateFrom) {
      where.createdAt = MoreThanOrEqual(new Date(query.dateFrom));
    } else if (query.dateTo) {
      where.createdAt = LessThanOrEqual(new Date(query.dateTo));
    }

    const [data, total] = await this.runRepo.findAndCount({
      where,
      order: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  // ─── Get one ───────────────────────────────────────────────────────────────

  async getTest(id: string): Promise<PerformanceTestRun> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException(`Test run ${id} not found`);
    return run;
  }

  // ─── Metrics time-series ───────────────────────────────────────────────────

  async getMetrics(id: string): Promise<{
    testRun: PerformanceTestRun;
    metrics: PerformanceTestMetric[];
  }> {
    const testRun = await this.getTest(id);
    const metrics = await this.metricRepo.find({
      where: { testRunId: id },
      order: { timestamp: 'ASC' },
    });
    return { testRun, metrics };
  }

  // ─── Errors ────────────────────────────────────────────────────────────────

  async getErrors(id: string): Promise<{
    testRun: PerformanceTestRun;
    errors: PerformanceTestError[];
    total: number;
  }> {
    const testRun = await this.getTest(id);
    const [errors, total] = await this.errorRepo.findAndCount({
      where: { testRunId: id },
      order: { timestamp: 'ASC' },
      take: 500,
    });
    return { testRun, errors, total };
  }

  // ─── Stop ──────────────────────────────────────────────────────────────────

  async stopTest(id: string): Promise<{ message: string }> {
    const run = await this.getTest(id);

    if (run.status !== 'running' && run.status !== 'pending') {
      throw new BadRequestException(
        `Cannot stop test run ${id} with status "${run.status}".`,
      );
    }

    // Mark stopped in DB first so collectResults picks it up
    await this.runRepo.update(id, { status: 'stopped' });

    if (this.k6Runner.isRunning(id)) {
      await this.k6Runner.stopRun(id);
    }

    return { message: `Test run ${id} stop signal sent.` };
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async deleteTest(id: string): Promise<{ message: string }> {
    const run = await this.getTest(id);

    if (run.status === 'running') {
      throw new BadRequestException(
        `Cannot delete a running test. Stop it first.`,
      );
    }

    // Cascades will remove metrics and errors
    await this.runRepo.delete(id);
    return { message: `Test run ${id} deleted.` };
  }

  // ─── Compare ───────────────────────────────────────────────────────────────

  async compareTests(
    idA: string,
    idB: string,
  ): Promise<{ a: PerformanceTestRun; b: PerformanceTestRun; diff: Record<string, unknown> }> {
    const [a, b] = await Promise.all([this.getTest(idA), this.getTest(idB)]);

    const numFields: (keyof PerformanceTestRun)[] = [
      'avgResponseTime',
      'p95ResponseTime',
      'p99ResponseTime',
      'successRate',
      'errorRate',
      'requestsPerSecond',
      'totalRequests',
      'successfulRequests',
    ];

    const diff: Record<string, unknown> = {};
    for (const field of numFields) {
      const va = a[field] as number | null;
      const vb = b[field] as number | null;
      if (va != null && vb != null) {
        diff[field] = {
          a: va,
          b: vb,
          delta: parseFloat((vb - va).toFixed(3)),
          deltaPercent:
            va !== 0
              ? parseFloat((((vb - va) / va) * 100).toFixed(2))
              : null,
        };
      }
    }

    return { a, b, diff };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private validateDuration(maxDuration: string): void {
    const match = /^(\d+)([smh])$/.exec(maxDuration);
    if (!match) throw new BadRequestException('Invalid maxDuration format');

    const value = parseInt(match[1], 10);
    const unit = match[2];
    let seconds = value;
    if (unit === 'm') seconds = value * 60;
    if (unit === 'h') seconds = value * 3600;

    if (seconds > MAX_DURATION_SECONDS) {
      throw new BadRequestException(
        `maxDuration exceeds the allowed cap of 30 minutes (got ${maxDuration}).`,
      );
    }
  }

  private async resetProductStock(
    productId: number,
    stock: number,
  ): Promise<void> {
    await this.runRepo.manager.query(
      'UPDATE products SET stock = $1 WHERE id = $2',
      [stock, productId],
    );
  }
}
