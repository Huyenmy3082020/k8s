import { Global, Module } from '@nestjs/common';
import { RedisStockService } from './redis-stock.service.js';

@Global()
@Module({
  providers: [RedisStockService],
  exports: [RedisStockService],
})
export class RedisModule {}
