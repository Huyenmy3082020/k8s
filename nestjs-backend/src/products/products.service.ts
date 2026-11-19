import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity.js';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
  ) {}

  async createProduct() {
    await this.productRepo.clear();

    return this.productRepo.save({
      name: 'iPhone 17',
      stock: 1,
    });
  }

  async getProducts() {
    return this.productRepo.find();
  }
}
