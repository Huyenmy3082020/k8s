import axios from 'axios'

export const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
})

export type TestStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped'
export type TestType = 'concurrent' | 'stress' | 'spike' | 'load'

export interface TestRun {
  id: string
  productId: number
  testType: TestType
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
  successRate: number | null
  errorRate: number | null
  avgResponseTime: number | null
  p95ResponseTime: number | null
  p99ResponseTime: number | null
  requestsPerSecond: number | null
  initialStock: number | null
  finalStock: number | null
  inventoryMismatch: boolean | null
  oversoldQuantity: number | null
  errorMessage: string | null
  createdAt: string
}

export interface CreateTestPayload {
  productId: number
  testType: TestType
  targetUrl: string
  vus: number
  iterations: number
  maxDuration: string
  initialStock?: number
}

export interface ListTestsResponse {
  data: TestRun[]
  total: number
  page: number
  limit: number
}

export const createTest = (payload: CreateTestPayload) =>
  api.post<TestRun>('/performance-tests', payload).then(r => r.data)

export const listTests = (params?: Record<string, unknown>) =>
  api.get<ListTestsResponse>('/performance-tests', { params }).then(r => r.data)

export const getTest = (id: string) =>
  api.get<TestRun>(`/performance-tests/${id}`).then(r => r.data)

export const stopTest = (id: string) =>
  api.post<{ message: string }>(`/performance-tests/${id}/stop`).then(r => r.data)

export const deleteTest = (id: string) =>
  api.delete<{ message: string }>(`/performance-tests/${id}`).then(r => r.data)
