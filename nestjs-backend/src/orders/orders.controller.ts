import { Controller, Post, Body } from '@nestjs/common';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('buy')
  buy(
    @Body()
    body: {
      productId: number;
      userId: string;
    },
  ) {
    return this.ordersService.buyProduct(body.productId, body.userId);
  }
}
