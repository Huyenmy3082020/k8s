import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const success = new Counter('buy_success');
const outOfStock = new Counter('buy_out_of_stock');
const unexpected = new Counter('buy_unexpected');
const responseTime = new Trend('buy_response_time');

http.setResponseCallback(http.expectedStatuses(200, 201, 400));

export const options = {
  scenarios: {
    concurrent_buy: {
      executor: 'shared-iterations',
      vus: 500,
      iterations: 10000,
      maxDuration: '10m',
    },
  },
};

export default function () {
  const response = http.post(
    'http://localhost:3000/orders/buy',
    JSON.stringify({
      productId: 1,
      userId: `USER_${__VU}_${__ITER}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: '30s',
    },
  );

  responseTime.add(response.timings.duration);

  if (response.status === 201) {
    success.add(1);
  } else if (response.status === 400) {
    outOfStock.add(1);
  } else {
    unexpected.add(1);
    console.log(`STATUS=${response.status} BODY=${response.body}`);
  }

  check(response, {
    'Expected business response': (r) => r.status === 201 || r.status === 400,
  });
}
