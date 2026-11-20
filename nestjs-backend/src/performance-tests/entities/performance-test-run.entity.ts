import {
  type Relation,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PerformanceTestMetric } from './performance-test-metric.entity.js';
import { PerformanceTestError } from './performance-test-error.entity.js';

export type TestStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped';

export type TestType =
  | 'concurrent'
  | 'stress'
  | 'spike'
  | 'load';

@Entity('performance_test_runs')
export class PerformanceTestRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  productId: number;

  @Column({ type: 'varchar', length: 20, default: 'concurrent' })
  testType: TestType;

  @Column({ type: 'varchar', length: 500 })
  targetUrl: string;

  /** Classic test case being exercised, e.g. 'oversell' */
  @Column({ type: 'varchar', length: 40, default: 'oversell' })
  scenario: string;

  /** Implementation under test, e.g. 'no-lock' | 'pessimistic' | 'optimistic' | 'atomic' */
  @Column({ type: 'varchar', length: 40, default: 'pessimistic' })
  strategy: string;

  @Column({ type: 'int' })
  vus: number;

  @Column({ type: 'int' })
  iterations: number;

  @Column({ type: 'varchar', length: 20 })
  maxDuration: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: TestStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  finishedAt: Date | null;

  /** Milliseconds */
  @Column({ type: 'bigint', nullable: true })
  durationMs: number | null;

  @Column({ type: 'int', nullable: true })
  totalRequests: number | null;

  @Column({ type: 'int', nullable: true })
  successfulRequests: number | null;

  @Column({ type: 'int', nullable: true })
  outOfStockRequests: number | null;

  @Column({ type: 'int', nullable: true })
  unexpectedRequests: number | null;

  /** 0–100 */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  successRate: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  errorRate: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  avgResponseTime: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  medianResponseTime: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  p90ResponseTime: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  p95ResponseTime: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  p99ResponseTime: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  maxResponseTime: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  requestsPerSecond: number | null;

  /** Stock at the moment before test started */
  @Column({ type: 'int', nullable: true })
  initialStock: number | null;

  /** Stock after test finished */
  @Column({ type: 'int', nullable: true })
  finalStock: number | null;

  /** Orders with status SUCCESS for this productId after the test */
  @Column({ type: 'int', nullable: true })
  successfulOrderCount: number | null;

  /** true if successfulRequests !== successfulOrderCount */
  @Column({ type: 'boolean', nullable: true })
  inventoryMismatch: boolean | null;

  /** How many extra units were sold beyond initial stock */
  @Column({ type: 'int', nullable: true })
  oversoldQuantity: number | null;

  @Column({ type: 'int', nullable: true })
  conflictRequests: number | null;

  /** Successful requests that observed a stock value another success also observed */
  @Column({ type: 'int', nullable: true })
  duplicateReadCount: number | null;

  /** PASS = data stayed consistent, FAIL = anomaly detected */
  @Column({ type: 'varchar', length: 10, nullable: true })
  verdict: 'PASS' | 'FAIL' | null;

  @Column({ type: 'jsonb', nullable: true })
  verdictReasons: string[] | null;

  /** Raw k6 JSON summary stored for debugging */
  @Column({ type: 'jsonb', nullable: true })
  k6Summary: Record<string, unknown> | null;

  /** Error message when status=failed */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToMany(() => PerformanceTestMetric, (m) => m.testRun, { cascade: true })
  metrics: Relation<PerformanceTestMetric[]>;

  @OneToMany(() => PerformanceTestError, (e) => e.testRun, { cascade: true })
  errors: Relation<PerformanceTestError[]>;
}
