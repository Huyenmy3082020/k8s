import { Controller, Get, Post, Body } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { OrdersService } from './orders.service.js';
import { BUY_STRATEGIES, BUY_STRATEGY_INFO } from './buy-strategies.js';
import type { BuyStrategy } from './buy-strategies.js';

class BuyDto {
  @IsInt()
  @Min(1)
  productId: number;

  @IsString()
  userId: string;

  @IsOptional()
  @IsIn(BUY_STRATEGIES)
  strategy?: BuyStrategy;

  @IsOptional()
  @IsUUID()
  testRunId?: string;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('buy')
  buy(@Body() body: BuyDto) {
    return this.ordersService.buyProduct(
      body.productId,
      body.userId,
      body.strategy ?? 'pessimistic',
      body.testRunId ?? null,
    );
  }

  @Get('strategies')
  strategies() {
    return BUY_STRATEGIES.map((key) => ({ key, ...BUY_STRATEGY_INFO[key] }));
  }
}
