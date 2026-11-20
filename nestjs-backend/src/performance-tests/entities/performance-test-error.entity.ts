import {
  type Relation,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PerformanceTestRun } from './performance-test-run.entity.js';

export type ErrorType =
  | 'http_error'
  | 'network_error'
  | 'timeout'
  | 'unexpected_status';

@Entity('performance_test_errors')
@Index(['testRunId'])
export class PerformanceTestError {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'uuid' })
  testRunId: string;

  @ManyToOne(() => PerformanceTestRun, (r) => r.errors, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'testRunId' })
  testRun: Relation<PerformanceTestRun>;

  /** Unix epoch ms */
  @Column({ type: 'bigint' })
  timestamp: number;

  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  errorType: ErrorType | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string | null;

  /** Truncated to 500 chars to prevent DB bloat */
  @Column({ type: 'varchar', length: 500, nullable: true })
  responseBody: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  requestUrl: string | null;
}
