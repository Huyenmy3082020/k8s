import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { VersionColumn } from 'typeorm/browser';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @VersionColumn()
  version: number;
}
