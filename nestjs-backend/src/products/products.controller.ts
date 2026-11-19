import { Controller, Get, Post } from '@nestjs/common';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('reset')
  reset() {
    return this.productsService.createProduct();
  }

  @Get()
  getAll() {
    return this.productsService.getProducts();
  }
}
