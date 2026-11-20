# Hướng dẫn: Concurrency Test Lab

Bộ công cụ để **tái hiện, đo và lưu lịch sử** các case kinh điển về đồng thời (race condition, lock...). Mỗi case có bản **lỗi** và các bản **sửa đúng**. Chạy k6 bắn tải vào từng bản, hệ thống tự chấm **PASS/FAIL** và lưu log từng request để xem lại.

---

## 1. Thành phần

| Dự án | Cổng | Vai trò |
|---|---|---|
| `nestjs-backend` | 3000 | API nghiệp vụ (`/orders/buy`), chạy k6, chấm verdict, lưu lịch sử và log |
| `performance-controller` | 5173 | Giao diện **tạo và chạy** test |
| `performance-dashboard` | 5174 (hoặc cổng Vite báo) | Giao diện **xem lịch sử**, chi tiết, request log, so sánh |
| PostgreSQL (docker) | 5432 | DB `race_demo`, user `postgres` / `123456` |
| Redis (docker) | 6379 | Bộ đếm tồn kho cho strategy `redis` (key `stock:product:<id>`) |
| k6 | — | Công cụ load test, backend gọi nó qua lệnh `k6 run` |

### Bảng dữ liệu

| Bảng | Nội dung |
|---|---|
| `products` | Sản phẩm: `stock`, `version` (dùng cho optimistic lock) |
| `orders` | Đơn hàng, gắn `testRunId` và `userId` |
| `performance_test_runs` | Mỗi lần chạy test: cấu hình, strategy, chỉ số (RPS, p95...), tồn kho trước và sau, **verdict + lý do** |
| `performance_test_metrics` | Chuỗi thời gian theo từng giây, dùng vẽ biểu đồ |
| `performance_test_errors` | Lỗi ngoài dự kiến do k6 ghi nhận |
| `request_logs` | **Log từng request**: stock đọc/ghi, thời gian chờ lock, tổng thời gian, retry, status, mã lỗi Postgres |

---

## 2. Cài đặt và khởi động

### Yêu cầu
- Node.js (khuyến nghị 22 LTS, xem mục 7)
- Docker Desktop
- k6: `winget install k6` (kiểm tra bằng `k6 version`)

### Bước 1: Cài thư viện (một lần)
```bash
cd nestjs-backend && npm install
cd ../performance-controller && npm install
cd ../performance-dashboard && npm install
```

### Bước 2: Bật PostgreSQL + Redis
```bash
cd nestjs-backend
docker compose up -d
```

### Bước 3: Chạy backend
Tạo file `nestjs-backend/.env` (nếu chưa có):
```
PORT=3000
```

Cách A (Node 22 trở lên):
```bash
npm run start:dev
```

Cách B (dùng khi `start:dev` lỗi `ERR_REQUIRE_CYCLE_MODULE` trên Node 20):
```bash
npx tsc -p tsconfig.build.json
node --env-file .env dist/main.js
```

Bảng được tạo tự động khi khởi động (`synchronize: true`).

### Bước 4: Tạo sản phẩm mẫu
```bash
curl -X POST http://localhost:3000/products/reset
```
Lệnh này xoá các sản phẩm cũ rồi tạo `iPhone 17` (id thường là 1). Kiểm tra bằng `curl http://localhost:3000/products`.

### Bước 5: Chạy 2 giao diện
```bash
cd performance-controller && npm run dev      # tạo test
cd performance-dashboard  && npm run dev      # xem lịch sử
```

---

## 3. Các case hiện có

### Case: Oversell / Race condition khi trừ tồn kho (`scenario = oversell`)

Rất nhiều người cùng bấm mua một sản phẩm có tồn kho giới hạn.

| Strategy | Đúng? | Cách làm | Kết quả mong đợi |
|---|---|---|---|
| `no-lock` | ❌ | `SELECT stock`, kiểm tra trong code, rồi `UPDATE stock = <giá trị đã đọc> - 1` | **FAIL**: nhiều request đọc cùng một giá trị, dẫn đến oversell và lost update |
| `pessimistic` | ✅ | `SELECT ... FOR UPDATE`, các request khác phải chờ | PASS. Thời gian chờ lock cao khi tải lớn |
| `optimistic` | ✅ | `UPDATE ... WHERE version = <đã đọc>`. Nếu không có dòng nào được cập nhật thì retry (tối đa 10 lần), quá số lần thì trả 409 | PASS. Có nhiều retry, p95 cao khi tranh chấp mạnh |
| `atomic` | ✅ | `UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock` | PASS. Nhanh nhất trong các cách chỉ dùng DB |
| `redis` | ✅ | Lua script trên Redis: `GET`, nếu > 0 thì `DECR`, làm nguyên tử. Chỉ request thắng suất mới ghi DB (trừ stock + tạo order). Ghi DB lỗi thì `INCR` hoàn suất | PASS. Nhanh nhất: request hết hàng bị từ chối ngay ở Redis, không chờ lock DB |

Mã HTTP trả về: `201` mua thành công, `400` hết hàng, `409` xung đột version (optimistic), `5xx` lỗi ngoài dự kiến.

### Cách chấm verdict
Sau khi k6 chạy xong, backend đối soát dữ liệu. Run bị **FAIL** nếu gặp bất kỳ điều nào sau:

| Kiểm tra | Điều kiện FAIL | Ý nghĩa |
|---|---|---|
| Oversell | `số đơn thành công > tồn kho ban đầu` | Bán vượt số hàng có |
| Lost update | `tồn kho ban đầu - tồn kho cuối ≠ số đơn thành công` | Lượt trừ kho bị ghi đè |
| Tồn kho âm | `tồn kho cuối < 0` | |
| Đọc trùng (race) | Có giá trị `stockBefore` được **hơn 1 request thành công** cùng đọc | Bằng chứng trực tiếp của race |
| Lỗi ngoài dự kiến | Có request 5xx hoặc timeout | |
| Redis lệch DB (chỉ strategy `redis`) | Stock trong Redis ≠ stock trong Postgres sau khi chạy | Bù trừ (hoàn suất) bị sai |

Lý do FAIL được lưu trong cột `verdictReasons` và hiển thị trên dashboard.

---

## 4. Cách chạy test

### Cách 1: Qua giao diện (khuyến nghị)
1. Mở **performance-controller**.
2. Điền form:
   - **Product ID**: id từ `/products` (thường là `1`)
   - **Chiến lược**: chọn `❌ No lock` hoặc một trong 3 bản ✅
   - **Target URL**: `http://localhost:3000/orders/buy`
   - **VUs**: `200`, **Iterations**: `1000`, **Max Duration**: `2m`
   - **Initial Stock**: `100` (tồn kho được đặt lại về giá trị này trước mỗi lần chạy)
3. Bấm **▶ Chạy Test**. Mỗi lúc chỉ chạy được một test.
4. Chạy xong thì mở **performance-dashboard** để xem kết quả.

> Mẹo: muốn thấy rõ khác biệt, giữ nguyên VUs, Iterations và Stock, chỉ đổi Strategy. Sau đó tick 2 run trên dashboard và bấm **So sánh**.

### Cách 2: Qua API (curl)
```bash
curl -X POST http://localhost:3000/performance-tests \
  -H "Content-Type: application/json" \
  -d '{
    "productId": 1,
    "strategy": "no-lock",
    "targetUrl": "http://localhost:3000/orders/buy",
    "vus": 200,
    "iterations": 1000,
    "maxDuration": "2m",
    "initialStock": 100
  }'
```
Lệnh trả về `id` của run. Theo dõi trạng thái bằng:
```bash
curl http://localhost:3000/performance-tests/<id>
```
Khi `status` chuyển thành `completed`, xem `verdict` và `verdictReasons`.

### Cách 3: Gọi thử một request bằng tay
```bash
curl -X POST http://localhost:3000/orders/buy \
  -H "Content-Type: application/json" \
  -d '{"productId":1,"userId":"me","strategy":"atomic"}'
```
Request không có `testRunId` thì log vẫn được ghi, nhưng không gắn với run nào.

### Kịch bản kiểm thử gợi ý

| # | Mục tiêu | Cấu hình | Kết quả mong đợi |
|---|---|---|---|
| 1 | Tái hiện race | `no-lock`, 200 VU, 1000 iter, stock 100 | FAIL, đơn thành công lớn hơn 100 rất nhiều |
| 2 | Xác nhận các bản sửa | Chạy lại #1 với `pessimistic`, `optimistic`, `atomic` | Cả 3 PASS, đúng 100 đơn, stock về 0 |
| 3 | Race ngay cả với tải nhỏ | `no-lock`, 20 VU, 200 iter, stock 10 | Thường vẫn FAIL |
| 4 | Tranh chấp lock nặng | `pessimistic`, 1000 VU, 10000 iter, stock 100 | PASS nhưng thời gian chờ lock và p95 tăng mạnh |
| 5 | Retry của optimistic | `optimistic`, 500 VU, stock 1000 | PASS, cột Retry lớn. Có thể xuất hiện 409 nếu quá 10 lần retry |
| 6 | So sánh hiệu năng | So sánh `atomic` với `pessimistic`, cùng cấu hình | `atomic` có RPS cao hơn và p95 thấp hơn |
| 7 | Flash sale | `redis`, `atomic` và `pessimistic`, 1000 VU, 50000 iter, stock 1, Max Duration `2m` | Cả 3 PASS, `redis` nhanh gấp khoảng 2,5–3 lần |

Kết quả tham khảo cho flash sale (1000 VU / 50.000 iter / stock 1):

| Strategy | Verdict | Thời gian chạy | RPS | p95 ms | p99 ms | Thời gian chờ trung bình của request hết hàng |
|---|---|---|---|---|---|---|
| redis | PASS | 31 s | 1647 | 807 | 941 | ~0,2 s |
| pessimistic | PASS | 80 s | 628 | 1982 | 2178 | ~1,6 s |
| atomic | PASS | 86 s | 584 | 2191 | 2798 | ~1,7 s |

Kết quả tham khảo (200 VU / 1000 iter / stock 100, máy dev):

| Strategy | Verdict | Đơn thành công | Stock cuối | p95 ms | RPS |
|---|---|---|---|---|---|
| no-lock | FAIL | 995 | 2 | 2296 | 150 |
| pessimistic | PASS | 100 | 0 | 831 | 345 |
| optimistic | PASS | 100 | 0 | 2151 | 283 |
| atomic | PASS | 100 | 0 | 553 | 469 |

---

## 5. Xem lịch sử và log (dashboard)

### Danh sách run
Bảng có các cột Strategy, Verdict (✓ PASS / ✗ FAIL), Status, Success%, p95, RPS... Lọc được theo status, product và ngày. Tick 2 run rồi bấm **So sánh** để đặt cạnh nhau.

### Chi tiết run
- **Khung verdict**: xanh nếu dữ liệu nhất quán, đỏ kèm danh sách lý do nếu có bất thường.
- **Thẻ chỉ số**: Total, Thành công, Out of Stock, 409 Conflict, **Đọc trùng stock**, Avg, P90, P95, P99, Max, RPS.
- **Các tab**:
  - **Overview**: phân vị thời gian phản hồi và phân loại request.
  - **Request Logs**:
    - *Tổng hợp theo kết quả*: số request, thời gian trung bình, thời gian chờ lock trung bình và lớn nhất, tổng retry theo từng status.
    - *Bằng chứng race condition*: các giá trị stock bị nhiều request thành công cùng đọc, ví dụ `stock=97 × 10`.
    - *Bảng log*: từng request với stock đọc/ghi, thời gian chờ lock, tổng thời gian, retry, và **timeline** (xám là phần chờ lock hoặc chờ đọc, màu là phần xử lý). Lọc theo status, tick "Chỉ hiện request đọc trùng stock", phân trang 200 dòng.
  - **Metrics**: biểu đồ theo thời gian (Avg/P95, RPS/VUs, Error%).
  - **Errors**: lỗi ngoài dự kiến.

### Đọc log thế nào
- **no-lock**: nhiều dòng có cùng "Stock đọc" (được tô đỏ) và cùng "Stock ghi". Mỗi dòng như vậy là một lượt trừ kho bị ghi đè.
- **pessimistic**: mỗi request thành công thấy một giá trị stock khác nhau (100, 99, 98...). Cột "Chờ lock" tăng dần vì các request phải xếp hàng.
- **optimistic**: cột Retry lớn hơn 0, và tổng thời gian dài hơn thời gian chờ đọc.
- **atomic**: không có bước đọc riêng. "Stock đọc" được suy ra bằng giá trị `RETURNING` cộng 1.

---

## 6. Tham chiếu API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/products/reset` | Xoá và tạo lại sản phẩm mẫu |
| GET | `/products` | Danh sách sản phẩm |
| POST | `/orders/buy` | Mua. Body: `productId`, `userId`, `strategy?` (mặc định `pessimistic`), `testRunId?` |
| GET | `/orders/strategies` | Danh sách strategy kèm mô tả |
| POST | `/performance-tests` | Tạo và chạy test (body như mục 4, cách 2) |
| GET | `/performance-tests` | Lịch sử. Query: `status`, `strategy`, `verdict`, `productId`, `dateFrom`, `dateTo`, `page`, `limit`, `sortBy`, `sortOrder` |
| GET | `/performance-tests/:id` | Chi tiết một run |
| GET | `/performance-tests/:id/logs` | Request log. Query: `status`, `page`, `limit` (tối đa 5000) |
| GET | `/performance-tests/:id/analysis` | Tổng hợp theo status và danh sách giá trị stock bị đọc trùng |
| GET | `/performance-tests/:id/metrics` | Chuỗi thời gian |
| GET | `/performance-tests/:id/errors` | Lỗi ngoài dự kiến |
| GET | `/performance-tests/compare?a=&b=` | So sánh 2 run |
| POST | `/performance-tests/:id/stop` | Dừng run đang chạy |
| DELETE | `/performance-tests/:id` | Xoá run cùng metrics, errors và request log |

Giới hạn: VUs tối đa 1000, Iterations tối đa 50000, Max Duration tối đa 30 phút, mỗi lúc chỉ một run.

### Truy vấn SQL hữu ích
```sql
-- Lịch sử verdict theo strategy
SELECT strategy, verdict, COUNT(*) FROM performance_test_runs GROUP BY 1,2;

-- Các giá trị stock bị đọc trùng trong một run
SELECT "stockBefore", COUNT(*) FROM request_logs
WHERE "testRunId" = '<id>' AND status = 'SUCCESS'
GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 1 DESC;

-- 20 request chờ lock lâu nhất
SELECT "userId", "lockWaitMs", "durationMs" FROM request_logs
WHERE "testRunId" = '<id>' ORDER BY "lockWaitMs" DESC NULLS LAST LIMIT 20;
```

---

## 7. Xử lý sự cố

| Triệu chứng | Nguyên nhân / Cách xử lý |
|---|---|
| `npm run start:dev` báo `ERR_REQUIRE_CYCLE_MODULE` | Nest CLI không chạy được trên Node 20.19. Nâng Node lên 22 LTS, hoặc dùng cách B ở mục 2 |
| Run chuyển `failed`, `errorMessage` nhắc tới k6 | Chưa cài k6 hoặc k6 không có trong PATH. Kiểm tra bằng `k6 version` |
| `409 Test run ... is currently running` | Đang có run khác. Chờ xong hoặc gọi `POST /performance-tests/<id>/stop` |
| Run kẹt ở `running` sau khi tắt backend | Sửa tay trong DB: `UPDATE performance_test_runs SET status='stopped' WHERE status IN ('running','pending');` |
| `ECONNREFUSED 5432` | Postgres chưa chạy: `docker compose up -d` |
| Frontend báo lỗi CORS | Backend cho phép mọi cổng `localhost` / `127.0.0.1` (`enableCors` trong `src/main.ts`). Nếu vẫn lỗi, build và khởi động lại backend |
| Không có sản phẩm | Gọi `POST /products/reset` rồi dùng id trả về |
| Rất nhiều lỗi `HTTP 0` / `connection refused` ngay giây đầu | Hàng đợi kết nối của Windows bị tràn khi quá nhiều kết nối mở cùng lúc. Template k6 đã mở kết nối rải đều khoảng 200 kết nối mỗi giây. Nếu vẫn lỗi, giảm VUs hoặc chạy trên Linux/k8s |
| Strategy `redis` trả 409 "not seeded" | Chưa nạp stock vào Redis. Hãy chạy test có `initialStock` (runner sẽ tự nạp), hoặc chạy `docker exec race-redis redis-cli set stock:product:1 100` |
| Lỗi kết nối Redis | `docker compose up -d redis`. Có thể đổi `REDIS_HOST` / `REDIS_PORT` trong `.env` |
| Run trong lúc test hiện thời gian chạy (Actual Duration) ~30 s nhưng Total < Iterations | Max Duration quá ngắn. Với 50.000 lượt, đặt `2m` |

---

## 8. Mở rộng: thêm case mới

Mỗi case mới làm theo cùng một khuôn:
1. **Backend**: thêm strategy (bản lỗi và bản đúng) vào service tương ứng, và ghi `request_logs` với `scenario` mới.
2. **k6**: thêm template trong `nestjs-backend/k6-tests/`.
3. **Verdict**: thêm luật kiểm tra trong `collectResults` (file `k6-runner.service.ts`).
4. **Frontend**: thêm strategy vào `STRATEGIES` trong `api.ts`.

Các case dự kiến làm tiếp: **Deadlock** (khoá theo thứ tự khác nhau, lỗi `40P01`), **Lost update / Optimistic** trên dữ liệu hồ sơ, **Double submit / Idempotency key**, **Isolation level** (READ COMMITTED, REPEATABLE READ, SERIALIZABLE, lỗi `40001`), **Lock timeout / NOWAIT / SKIP LOCKED**, **Connection pool exhaustion**, **Distributed lock** khi chạy nhiều instance trên k8s.
