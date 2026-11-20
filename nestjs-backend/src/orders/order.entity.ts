import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productId: number;

  @Column({ default: 'SUCCESS' })
  status: string;

  /** Which performance test produced this order (null for manual calls) */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  testRunId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  userId: string | null;
}
