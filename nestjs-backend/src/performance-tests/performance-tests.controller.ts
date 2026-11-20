import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PerformanceTestsService } from './performance-tests.service.js';
import { CreatePerformanceTestDto } from './dto/create-performance-test.dto.js';
import { QueryPerformanceTestsDto } from './dto/query-performance-tests.dto.js';

@Controller('performance-tests')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PerformanceTestsController {
  constructor(private readonly service: PerformanceTestsService) {}

  /**
   * POST /performance-tests
   * Create and immediately start a new test run.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createTest(@Body() dto: CreatePerformanceTestDto) {
    return this.service.createTest(dto);
  }

  /**
   * GET /performance-tests
   * List test history with pagination, filtering, and sorting.
   */
  @Get()
  listTests(@Query() query: QueryPerformanceTestsDto) {
    return this.service.listTests(query);
  }

  /**
   * GET /performance-tests/compare?a=<id>&b=<id>
   * Compare two test runs side-by-side.
   */
  @Get('compare')
  compareTests(
    @Query('a', ParseUUIDPipe) a: string,
    @Query('b', ParseUUIDPipe) b: string,
  ) {
    return this.service.compareTests(a, b);
  }

  /**
   * GET /performance-tests/:id
   * Full detail of a single test run.
   */
  @Get(':id')
  getTest(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTest(id);
  }

  /**
   * GET /performance-tests/:id/metrics
   * Time-series metric buckets for charts.
   */
  @Get(':id/metrics')
  getMetrics(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getMetrics(id);
  }

  /**
   * GET /performance-tests/:id/errors
   * Unexpected error events captured during the test.
   */
  @Get(':id/errors')
  getErrors(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getErrors(id);
  }

  /**
   * GET /performance-tests/:id/logs?status=&page=&limit=
   * Per-request log rows (what each request saw, lock wait, outcome).
   */
  @Get(':id/logs')
  getLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit = 200,
  ) {
    return this.service.getRequestLogs(id, {
      status: status || undefined,
      page: Math.max(1, page),
      limit: Math.min(Math.max(1, limit), 5000),
    });
  }

  /**
   * GET /performance-tests/:id/analysis
   * Aggregates by outcome + stock values read by more than one successful request.
   */
  @Get(':id/analysis')
  getAnalysis(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getRequestLogAnalysis(id);
  }

  /**
   * POST /performance-tests/:id/stop
   * Send SIGTERM to the k6 process and mark the run as stopped.
   */
  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  stopTest(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.stopTest(id);
  }

  /**
   * DELETE /performance-tests/:id
   * Remove a test run record and its metrics/errors.
   * Does NOT touch orders or products tables.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteTest(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteTest(id);
  }
}
