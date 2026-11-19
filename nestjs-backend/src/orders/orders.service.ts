import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class OrdersService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async buyProduct(productId: number, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      console.log(`${userId}: START BUY`);

      // 1. Lock product row
      const products = await manager.query(
        `
        SELECT id, name, stock
        FROM products
        WHERE id = $1
        FOR UPDATE
        `,
        [productId],
      );

      const product = products[0];

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      console.log(`${userId}: LOCK ACQUIRED - STOCK = ${product.stock}`);

      // 2. Check stock
      if (product.stock <= 0) {
        throw new BadRequestException('Out of stock');
      }

      // 3. Decrease stock
      await manager.query(
        `
        UPDATE products
        SET stock = stock - 1
        WHERE id = $1
        `,
        [productId],
      );

      // 4. Create order
      await manager.query(
        `
  INSERT INTO orders ("productId", status)
  VALUES ($1, $2)
  `,
        [productId, 'SUCCESS'],
      );

      console.log(`${userId}: BUY SUCCESS`);

      return {
        message: 'Buy successfully',
        userId,
        productId,
      };
    });
  }
}
