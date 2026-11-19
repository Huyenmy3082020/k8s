import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PerformanceTestRun } from './performance-test-run.entity.js';

@Entity('performance_test_metrics')
@Index(['testRunId', 'timestamp'])
export class PerformanceTestMetric {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'uuid' })
  testRunId: string;

  @ManyToOne(() => PerformanceTestRun, (r) => r.metrics, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'testRunId' })
  testRun: PerformanceTestRun;

  /** Unix epoch seconds — the start of this 1-second bucket */
  @Column({ type: 'bigint' })
  timestamp: number;

  @Column({ type: 'int', default: 0 })
  totalRequests: number;

  @Column({ type: 'int', default: 0 })
  successfulRequests: number;

  @Column({ type: 'int', default: 0 })
  outOfStockRequests: number;

  @Column({ type: 'int', default: 0 })
  unexpectedRequests: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  avgResponseTime: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  p95ResponseTime: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  requestsPerSecond: number | null;

  @Column({ type: 'int', default: 0 })
  activeVUs: number;
}
