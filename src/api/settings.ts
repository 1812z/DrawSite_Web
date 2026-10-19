import { request } from '@/lib/http'

export interface PublicModel {
  id: string
  displayName: string
  supportsTools: boolean
  supportsReasoning: boolean
}

export interface PublicSettings {
  registrationEnabled: boolean
  models: PublicModel[]
  defaultModelId: string | null
}

// 提交体：apiKey 可空，留空（未传）表示保留已有密钥
export interface ModelConfig {
  id: string
  displayName: string
  provider: string
  modelName: string
  baseUrl: string
  apiKey?: string
  enabled: boolean
  supportsTools: boolean
  temperature: number
  timeoutSeconds: number
  supportsReasoning?: boolean | null
}

// 读取视图：服务端不回传密钥明文，仅标记是否已配置
export interface AdminModelView {
  id: string
  displayName: string
  provider: string
  modelName: string
  baseUrl: string
  apiKeyConfigured: boolean
  enabled: boolean
  supportsTools: boolean
  temperature: number
  timeoutSeconds: number
  supportsReasoning?: boolean | null
}

export interface AdminSettings {
  registrationEnabled: boolean
  models: AdminModelView[]
  defaultModelId: string | null
  versions: Record<string, number>
}

export interface UpdateSettingsRequest {
  registrationEnabled: boolean
  models: ModelConfig[]
  defaultModelId: string | null
  versions: Record<string, number>
}

export const getPublicSettings = () => request<PublicSettings>('/platform/public-settings')

export const getAdminSettings = () => request<AdminSettings>('/admin/settings')

export const updateAdminSettings = (payload: UpdateSettingsRequest) =>
  request<AdminSettings>('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) })
