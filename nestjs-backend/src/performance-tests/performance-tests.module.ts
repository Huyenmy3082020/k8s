import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceTestRun } from './entities/performance-test-run.entity.js';
import { PerformanceTestMetric } from './entities/performance-test-metric.entity.js';
import { PerformanceTestError } from './entities/performance-test-error.entity.js';
import { PerformanceTestsController } from './performance-tests.controller.js';
import { PerformanceTestsService } from './performance-tests.service.js';
import { K6RunnerService } from './k6-runner.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceTestRun,
      PerformanceTestMetric,
      PerformanceTestError,
    ]),
  ],
  controllers: [PerformanceTestsController],
  providers: [PerformanceTestsService, K6RunnerService],
})
export class PerformanceTestsModule {}
