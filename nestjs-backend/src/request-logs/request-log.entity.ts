import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export type RequestLogStatus = 'SUCCESS' | 'OUT_OF_STOCK' | 'CONFLICT' | 'ERROR';

/**
 * One row per business request hitting a scenario endpoint.
 * Lets us replay *what each request saw* (stockBefore) and how long it waited for a lock.
 */
@Entity('request_logs')
@Index(['testRunId', 'startedAt'])
export class RequestLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'uuid', nullable: true })
  testRunId: string | null;

  @Column({ type: 'varchar', length: 40 })
  scenario: string;

  @Column({ type: 'varchar', length: 40 })
  strategy: string;

  @Column({ type: 'varchar', length: 100 })
  userId: string;

  @Column({ type: 'int' })
  productId: number;

  @Column({ type: 'timestamp with time zone' })
  startedAt: Date;

  /** When the row was read (and locked, for pessimistic) */
  @Column({ type: 'timestamp with time zone', nullable: true })
  lockAcquiredAt: Date | null;

  @Column({ type: 'timestamp with time zone' })
  finishedAt: Date;

  @Column({ type: 'numeric', precision: 10, scale: 3 })
  durationMs: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  lockWaitMs: number | null;

  /** Stock value this request observed before writing */
  @Column({ type: 'int', nullable: true })
  stockBefore: number | null;

  @Column({ type: 'int', nullable: true })
  stockAfter: number | null;

  @Column({ type: 'varchar', length: 20 })
  status: RequestLogStatus;

  @Column({ type: 'int' })
  httpStatus: number;

  @Column({ type: 'int', default: 0 })
  retries: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pgErrorCode: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  message: string | null;
}
