export const BUY_STRATEGIES = [
  'no-lock',
  'pessimistic',
  'optimistic',
  'atomic',
  'redis',
] as const;

export type BuyStrategy = (typeof BUY_STRATEGIES)[number];

export const BUY_STRATEGY_INFO: Record<
  BuyStrategy,
  { title: string; correct: boolean; description: string }
> = {
  'no-lock': {
    title: 'Không khoá (lỗi)',
    correct: false,
    description:
      'SELECT stock → kiểm tra trong code → UPDATE stock = <giá trị đã đọc> - 1. Nhiều request đọc cùng một giá trị nên bán vượt tồn kho (oversell) và mất cập nhật (lost update).',
  },
  pessimistic: {
    title: 'Pessimistic lock (SELECT ... FOR UPDATE)',
    correct: true,
    description:
      'Khoá dòng sản phẩm trong transaction; các request khác phải chờ. Đúng nhưng tuần tự hoá, lock wait cao khi tải lớn.',
  },
  optimistic: {
    title: 'Optimistic lock (cột version)',
    correct: true,
    description:
      'Đọc stock + version, UPDATE ... WHERE version = <đã đọc>. Nếu 0 dòng bị ảnh hưởng thì retry (tối đa N lần) rồi trả 409.',
  },
  atomic: {
    title: 'Atomic conditional update',
    correct: true,
    description:
      'Một câu lệnh: UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock. Nhanh và đúng nhất cho bài toán trừ kho đơn giản.',
  },
  redis: {
    title: 'Redis counter (Lua DECR)',
    correct: true,
    description:
      'Redis giữ bộ đếm tồn kho; một Lua script kiểm tra và trừ nguyên tử. Chỉ request giành được suất mới chạm Postgres (trừ stock + ghi order). Ghi DB lỗi thì INCR hoàn suất. Request hết hàng bị từ chối ngay ở Redis, không chờ lock DB.',
  },
};
