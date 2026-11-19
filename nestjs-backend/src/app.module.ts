import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from './orders/orders.module.js';
import { ProductsModule } from './products/products.module.js';
import { PerformanceTestsModule } from './performance-tests/performance-tests.module.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '123456',
      database: 'race_demo',

      autoLoadEntities: true,
      synchronize: true,

      extra: {
        options: '-c timezone=Asia/Ho_Chi_Minh',
      },
    }),

    ProductsModule,
    OrdersModule,
    PerformanceTestsModule,
  ],
})
export class AppModule {}
