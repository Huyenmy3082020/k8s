import {
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { TestStatus } from '../entities/performance-test-run.entity.js';

const STATUSES: TestStatus[] = [
  'pending',
  'running',
  'completed',
  'failed',
  'stopped',
];

const SORT_FIELDS = [
  'createdAt',
  'startedAt',
  'finishedAt',
  'durationMs',
  'totalRequests',
  'successRate',
  'avgResponseTime',
] as const;

type SortField = (typeof SORT_FIELDS)[number];

export class QueryPerformanceTestsDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: TestStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @IsOptional()
  @IsString()
  strategy?: string;

  @IsOptional()
  @IsIn(['PASS', 'FAIL'])
  verdict?: 'PASS' | 'FAIL';

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: SortField = 'createdAt';

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
