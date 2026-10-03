import { request } from '@/lib/http'

export interface HealthStatus {
  application: string
  status: string
  timestamp: string
}

export const getHealth = () => request<HealthStatus>('/system/health')
