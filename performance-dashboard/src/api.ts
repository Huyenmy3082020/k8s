import axios from 'axios'

export const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
})

export type TestStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped'
export type TestType = 'concurrent' | 'stress' | 'spike' | 'load'
export type Strategy = 'no-lock' | 'pessimistic' | 'optimistic' | 'atomic' | 'redis'
export const STRATEGIES: { key: Strategy; label: string; correct: boolean }[] = [
  { key: 'no-lock', label: 'No lock (lỗi)', correct: false },
  { key: 'pessimistic', label: 'Pessimistic (FOR UPDATE)', correct: true },
  { key: 'optimistic', label: 'Optimistic (version)', correct: true },
  { key: 'atomic', label: 'Atomic UPDATE ... WHERE stock > 0', correct: true },
  { key: 'redis', label: 'Redis counter (Lua DECR)', correct: true },
]

export interface TestRun {
  id: string
  productId: number
  testType: TestType
  scenario: string
  strategy: Strategy
  verdict: 'PASS' | 'FAIL' | null
  verdictReasons: string[] | null
  duplicateReadCount: number | null
  conflictRequests: number | null
  targetUrl: string
  vus: number
  iterations: number
  maxDuration: string
  status: TestStatus
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  totalRequests: number | null
  successfulRequests: number | null
  outOfStockRequests: number | null
  unexpectedRequests: number | null
  successRate: number | null
  errorRate: number | null
  avgResponseTime: number | null
  medianResponseTime: number | null
  p90ResponseTime: number | null
  p95ResponseTime: number | null
  p99ResponseTime: number | null
  maxResponseTime: number | null
  requestsPerSecond: number | null
  initialStock: number | null
  finalStock: number | null
  successfulOrderCount: number | null
  inventoryMismatch: boolean | null
  oversoldQuantity: number | null
  errorMessage: string | null
  createdAt: string
}

export interface TestMetric {
  id: string
  testRunId: string
  timestamp: string
  vus: number | null
  rps: number | null
  avgResponseTime: number | null
  p95ResponseTime: number | null
  errorRate: number | null
}

export interface TestError {
  id: string
  testRunId: string
  timestamp: string
  statusCode: number | null
  errorType: string | null
  message: string | null
  url: string | null
}

export interface ListTestsResponse {
  data: TestRun[]
  total: number
  page: number
  limit: number
}

export interface MetricsResponse {
  testRun: TestRun
  metrics: TestMetric[]
}

export interface ErrorsResponse {
  testRun: TestRun
  errors: TestError[]
  total: number
}

export interface CompareResponse {
  a: TestRun
  b: TestRun
  diff: Record<string, { a: number; b: number; delta: number; deltaPercent: number | null }>
}

export const listTests = (params?: Record<string, unknown>) =>
  api.get<ListTestsResponse>('/performance-tests', { params }).then(r => r.data)

export const getTest = (id: string) =>
  api.get<TestRun>(`/performance-tests/${id}`).then(r => r.data)

export const getMetrics = (id: string) =>
  api.get<MetricsResponse>(`/performance-tests/${id}/metrics`).then(r => r.data)

export const getErrors = (id: string) =>
  api.get<ErrorsResponse>(`/performance-tests/${id}/errors`).then(r => r.data)

export const compareTests = (a: string, b: string) =>
  api.get<CompareResponse>(`/performance-tests/compare`, { params: { a, b } }).then(r => r.data)

export type LogStatus = 'SUCCESS' | 'OUT_OF_STOCK' | 'CONFLICT' | 'ERROR'

export interface RequestLog {
  id: string
  userId: string
  strategy: string
  startedAt: string
  lockAcquiredAt: string | null
  finishedAt: string
  durationMs: string
  lockWaitMs: string | null
  stockBefore: number | null
  stockAfter: number | null
  status: LogStatus
  httpStatus: number
  retries: number
  pgErrorCode: string | null
  message: string | null
}

export interface LogsResponse {
  data: RequestLog[]
  total: number
  page: number
  limit: number
}

export interface AnalysisResponse {
  summary: {
    status: LogStatus
    count: number
    avgDurationMs: number | null
    avgLockWaitMs: number | null
    maxLockWaitMs: number | null
    retries: number
  }[]
  duplicateReads: { stock: number; count: number }[]
}

export const getLogs = (id: string, params: { status?: string; page?: number; limit?: number }) =>
  api.get<LogsResponse>(`/performance-tests/${id}/logs`, { params }).then(r => r.data)

export const getAnalysis = (id: string) =>
  api.get<AnalysisResponse>(`/performance-tests/${id}/analysis`).then(r => r.data)
