import { ApiError } from '@/lib/http'

/**
 * 后端错误码 → 可读文案。来源 docs/backend-api.md、docs/agent.md 与 docs/project-tools.md。
 * 对话任务的异步错误码（RunView.errorCode）也在这张表里，同步与异步共用。
 */
export const API_ERROR_MESSAGES: Record<string, string> = {
  // 通用
  UNAUTHORIZED: '登录已过期，请重新登录。',
  FORBIDDEN: '没有权限执行该操作。',
  VALIDATION_ERROR: '提交的内容不合法。',
  NOT_FOUND: '请求的资源不存在。',

  // 账号
  INVALID_CREDENTIALS: '用户名或密码错误。',
  USERNAME_EXISTS: '该用户名已被占用。',
  REGISTRATION_DISABLED: '平台已关闭注册，请联系管理员。',
  OLD_PASSWORD_INCORRECT: '原密码不正确。',
  USER_NOT_FOUND: '用户不存在。',

  // 应用与工作区
  APPLICATION_NOT_FOUND: '应用不存在或已被删除。',
  APPLICATION_NOT_READY: '应用工作区尚未初始化完成，请稍后再试。',
  APPLICATION_BUSY: '应用正在初始化，暂时无法删除，请稍后再试。',
  WORKSPACE_INIT_FAILED: '工作区初始化失败。',
  WORKSPACE_DELETE_FAILED: '工作区目录清理失败，数据库记录已保留，可重试删除。',
  DOCUMENT_NOT_FOUND: '文档不存在。',
  DOCUMENT_TOO_LARGE: '文档超过可读取的大小限制。',

  // 会话
  CONVERSATION_NOT_FOUND: '会话不存在或已被删除。',

  // 询问细节（docs/agent.md「询问细节工具」）
  QUESTION_NOT_FOUND: '询问不存在或已被清理。',
  QUESTION_NOT_PENDING: '该询问已回答，或任务已停止。',
  INVALID_ANSWERS: '答案不完整：每题至少选择一个候选项或填写自定义内容。',

  // 平台设置
  SETTINGS_CONFLICT: '平台设置已被他人修改，请重新读取后再提交。',
  SETTINGS_INVALID: '平台配置缺失或损坏，请联系管理员。',

  // 对话任务：同步错误码
  MODEL_UNAVAILABLE: '所选模型不可用，请在平台设置中确认模型已启用。',
  MODEL_CREDENTIAL_MISSING: '所选模型尚未配置密钥，请联系管理员。',
  REASONING_UNSUPPORTED: '该模型未开启思考强度支持。',
  TOOLS_UNSUPPORTED: '该模型未开启工具支持，请换模型或关闭工具调用。',
  TOOL_NOT_AVAILABLE: '选择了不存在的工具，请刷新工具列表后重试。',
  /** 全局记忆工具：读取后记忆被并发改动，需要重新读取再合并（docs/memory.md） */
  MEMORY_CONFLICT: '全局记忆已被改动，请重新读取后再保存。',
  /** 全局记忆工具：本次任务关闭了记忆，工具被摘掉后仍被直接调用 */
  MEMORY_DISABLED: '本次任务关闭了记忆，无法读写全局记忆。',
  CONVERSATION_BUSY: '当前会话正在回复，请等待完成或先取消。',
  AGENT_BUSY: '对话服务繁忙，请稍后重试。',
  RUN_NOT_FOUND: '对话任务不存在。',

  // 对话任务：异步错误码
  MODEL_TIMEOUT: '模型响应超时，本次回复未保存。',
  MODEL_REQUEST_FAILED: '模型调用失败，本次回复未保存。',
  OUTPUT_LIMIT: '回复超过长度限制，本次回复未保存。',
  EMPTY_OR_INVALID_RESPONSE: '模型未返回有效内容。',
  RESULT_SAVE_FAILED: '回复保存失败。',
  SERVER_RESTARTED: '服务重启导致任务中断。',
}

/** 优先用后端错误码查文案；查不到时退回 fallback，并把原始错误码附在后面。 */
export function apiErrorMessage(code: string | null | undefined, fallback = '操作失败'): string {
  if (!code) return fallback
  return API_ERROR_MESSAGES[code] ?? `${fallback}（${code}）`
}

/**
 * 把异常转成展示用文案。ApiError 会带上错误码与 HTTP 状态，便于排查；
 * 后端不回传服务商原始报错，所以错误码是唯一线索。
 */
export function describeError(cause: unknown, fallback = '操作失败'): string {
  if (cause instanceof ApiError) {
    return `${apiErrorMessage(cause.code, cause.message)}（${cause.code} · HTTP ${cause.status}）`
  }
  if (cause instanceof Error) return cause.message
  return fallback
}
