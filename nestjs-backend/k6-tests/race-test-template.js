/**
 * k6 script template for performance testing.
 *
 * This file is NOT executed directly by NestJS.
 * K6RunnerService generates a parameterised copy at runtime and
 * passes it to k6 via: k6 run --out json=<file> <script>
 *
 * Placeholders replaced at runtime:
 *   __TARGET_URL__
 *   __PRODUCT_ID__
 *   __VUS__
 *   __ITERATIONS__
 *   __MAX_DURATION__
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend, Gauge } from 'k6/metrics';

const buySuccess    = new Counter('buy_success');
const buyOutOfStock = new Counter('buy_out_of_stock');
const buyUnexpected = new Counter('buy_unexpected');
const responseTime  = new Trend('buy_response_time', true); // percentiles enabled
const activeVUs     = new Gauge('active_vus');

http.setResponseCallback(http.expectedStatuses(200, 201, 400));

export const options = {
  scenarios: {
    concurrent_buy: {
      executor: 'shared-iterations',
      vus: __VUS__,
      iterations: __ITERATIONS__,
      maxDuration: '__MAX_DURATION__',
    },
  },
  thresholds: {
    // These are informational — we never want k6 to abort early.
    // Failing thresholds are captured in the summary but do not stop the test.
    buy_response_time: ['p(99)<60000'],
  },
};

export default function () {
  activeVUs.add(1);

  const payload = JSON.stringify({
    productId: __PRODUCT_ID__,
    userId: `USER_${__VU}_${__ITER}`,
  });

  const response = http.post('__TARGET_URL__', payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30s',
  });

  responseTime.add(response.timings.duration);

  if (response.status === 201) {
    buySuccess.add(1);
  } else if (response.status === 400) {
    buyOutOfStock.add(1);
  } else {
    buyUnexpected.add(1);
    // Status and truncated body logged to stderr; captured by runner
    console.error(`UNEXPECTED STATUS=${response.status} BODY=${String(response.body).substring(0, 200)}`);
  }

  check(response, {
    'is expected business response': (r) => r.status === 201 || r.status === 400,
  });

  activeVUs.add(-1);
}

/**
 * handleSummary is called once by k6 after the test finishes.
 * We write a JSON file so NestJS can parse the summary safely.
 * The output path is injected at script-generation time.
 */
export function handleSummary(data) {
  return {
    '__SUMMARY_OUTPUT_PATH__': JSON.stringify(data),
    stdout: '\n--- k6 test finished ---\n',
  };
}
