import { request } from '@/lib/http'

export interface DockerConfig {
  maxRunning: number; maxContainers: number; maxPlatformRunning: number; diskMiB: number
  memoryMiB: number; cpus: number; pids: number; temporaryMinutes: number
  publicHost: string; portStart: number; portEnd: number
}
export interface DockerTemplate { id: string; name: string; image: string; command: string[]; internalPort: number; healthPath: string; enabled: boolean; instructions?: string | null }
export interface Container { id: string; ownerUserId: string; applicationId: string; templateId: string; name: string; purpose: string; status: string; internalPort: number; secondaryInternalPort: number; hostPort: number | null; secondaryHostPort: number | null; publicUrl: string | null; secondaryPublicUrl: string | null; expiresAt: string | null; error: string | null }
export interface Deployment { id: string; applicationId: string; containerId: string | null; type: 'STATIC' | 'SERVICE'; directory: string | null; url: string; status: string; error: string | null }
export const templates = (admin = false) => request<DockerTemplate[]>(`${admin ? '/admin' : ''}/docker/templates`)
export const containers = (admin = false) => request<Container[]>(`${admin ? '/admin' : ''}/docker/containers`)
export const config = () => request<{ config: DockerConfig }>('/admin/docker/config')
export const saveConfig = (value: DockerConfig) => request<{ config: DockerConfig }>('/admin/docker/config', { method: 'PUT', body: JSON.stringify(value) })
export const saveTemplate = (value: DockerTemplate) => request<DockerTemplate>('/admin/docker/templates', { method: 'PUT', body: JSON.stringify(value) })
export const removeTemplate = (id: string) => request(`/admin/docker/templates/${id}`, { method: 'DELETE' })
export const pull = (id: string) => request<string>(`/admin/docker/templates/${id}/pull`, { method: 'POST', signal: AbortSignal.timeout(310000) })
export const engineStatus = () => request<string>('/admin/docker/status')
export const create = (applicationId: string, templateId: string, purpose: string) => request<Container>('/docker/containers', { method: 'POST', body: JSON.stringify({ applicationId, templateId, purpose }), signal: AbortSignal.timeout(120000) })
export const action = (id: string, action: string, admin = false) => request(`${admin ? '/admin' : ''}/docker/containers/${id}/${action}`, { method: 'POST', signal: AbortSignal.timeout(60000) })
export const remove = (id: string, admin = false) => request(`${admin ? '/admin' : ''}/docker/containers/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(60000) })
export const logs = (id: string, admin = false) => request<string>(`${admin ? '/admin' : ''}/docker/containers/${id}/logs`)
export const execute = (id: string, command: string) => request<{ exitCode: number; output: string }>(`/docker/containers/${id}/exec`, { method: 'POST', body: JSON.stringify({ command, timeoutSeconds: 120 }), signal: AbortSignal.timeout(140000) })
export const deployments = (admin = false) => request<Deployment[]>(`${admin ? '/admin' : ''}/deployments`)
export const publish = (applicationId: string, type: 'STATIC' | 'SERVICE', containerId?: string, directory?: string) => request<Deployment>('/deployments', { method: 'POST', body: JSON.stringify({ applicationId, type, containerId, directory }), signal: AbortSignal.timeout(90000) })
export const offline = (id: string, admin = false) => request(`${admin ? '/admin' : ''}/deployments/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(90000) })
