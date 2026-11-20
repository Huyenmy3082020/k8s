import { IsInt, IsString, IsUrl, IsIn, Min, Max, Matches, IsOptional } from 'class-validator';
import { BUY_STRATEGIES } from '../../orders/buy-strategies.js';
import type { BuyStrategy } from '../../orders/buy-strategies.js';
import type { TestType } from '../entities/performance-test-run.entity.js';

const TEST_TYPES: TestType[] = ['concurrent', 'stress', 'spike', 'load'];

/** Duration string: digits followed by s, m, or h. E.g. "10m", "30s", "1h" */
const DURATION_PATTERN = /^\d+[smh]$/;

export class CreatePerformanceTestDto {
  @IsInt()
  @Min(1)
  productId: number;

  @IsIn(TEST_TYPES)
  @IsOptional()
  testType?: TestType;

  @IsIn(BUY_STRATEGIES)
  @IsOptional()
  strategy?: BuyStrategy;

  @IsUrl({ require_tld: false })
  targetUrl: string;

  /**
   * Virtual users — capped at 1000 to prevent accidental overload.
   */
  @IsInt()
  @Min(1)
  @Max(1000)
  vus: number;

  /**
   * Total iterations — capped at 50000.
   */
  @IsInt()
  @Min(1)
  @Max(50000)
  iterations: number;

  /**
   * Max duration string such as "10m", "30s", "1h". Capped to 30m in service.
   */
  @IsString()
  @Matches(DURATION_PATTERN, {
    message: 'maxDuration must be a number followed by s, m, or h (e.g. "10m")',
  })
  maxDuration: string;

  /**
   * Optional: reset product stock to this value before the test starts.
   * If omitted, product stock is not touched.
   */
  @IsInt()
  @Min(0)
  @IsOptional()
  initialStock?: number;
}
