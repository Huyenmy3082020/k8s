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
 *   __STRATEGY__
 *   __TEST_RUN_ID__
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Gauge } from 'k6/metrics';

const buySuccess    = new Counter('buy_success');
const buyOutOfStock = new Counter('buy_out_of_stock');
const buyUnexpected = new Counter('buy_unexpected');
const buyConflict   = new Counter('buy_conflict');
const responseTime  = new Trend('buy_response_time', true); // percentiles enabled
const activeVUs     = new Gauge('active_vus');

http.setResponseCallback(http.expectedStatuses(200, 201, 400, 409));

export const options = {
  // k6 omits p(99) by default — request it explicitly so the dashboard can show it
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
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
  // Stagger each VU's first connection at ~200 new connections/s: opening 1000 TCP connections in the
  // same instant overflows the OS accept queue (Windows caps it at ~200 → "connection refused"),
  // especially when the server is busy (e.g. the fast redis strategy). Keep-alive reuses it afterwards.
  if (__ITER === 0) sleep(((__VU - 1) % 1000) * 0.005);

  activeVUs.add(1);

  const payload = JSON.stringify({
    productId: __PRODUCT_ID__,
    userId: `USER_${__VU}_${__ITER}`,
    strategy: '__STRATEGY__',
    testRunId: '__TEST_RUN_ID__',
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
  } else if (response.status === 409) {
    buyConflict.add(1);
  } else {
    buyUnexpected.add(1);
    // Status and truncated body logged to stderr; captured by runner
    console.error(`UNEXPECTED STATUS=${response.status} BODY=${String(response.body).substring(0, 200)}`);
  }

  check(response, {
    'is expected business response': (r) => r.status === 201 || r.status === 400 || r.status === 409,
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
