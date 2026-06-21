import Ajv, { type ErrorObject } from 'ajv'
import type { Hook } from '../../shared/types'

// allErrors：一次收集所有错误，便于前端一并展示
const ajv = new Ajv({ allErrors: true })

const HOOK_TYPES = [
  'PreToolUse', 'PostToolUse', 'MessageDisplay', 'Notification', 'UserPromptSubmit',
  'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact',
  'SessionStart', 'SessionEnd', 'ConfigChange', 'Elicitation', 'ElicitationResult',
  'PermissionRequest', 'PostSession',
  // legacy
  'pre-tool', 'post-tool', 'pre-command', 'post-command', 'pre-commit', 'post-commit',
]

/** 单个 action 的 schema：按 type 分支（command 需 command|args，http 需 http(s) url，prompt 需 prompt）。 */
export const hookActionSchema = {
  type: 'object',
  required: ['type'],
  properties: {
    // command/http/prompt 是规范取值；legacy 抽象动词读取时已映射，写入校验只认这三种
    type: { enum: ['command', 'http', 'prompt'] },
    command: { type: 'string' },
    args: { type: 'array', items: { type: 'string' } },
    prompt: { type: 'string' },
    url: { type: 'string' },
    method: { enum: ['POST', 'GET', 'PUT'] },
    headers: { type: 'object' },
    body: { type: 'string' },
    timeout: { type: 'number' },
    continueOnError: { type: 'boolean' },
    continueOnBlock: { type: 'boolean' },
    terminalSequence: { type: 'string' },
  },
  allOf: [
    {
      if: { properties: { type: { const: 'command' } } },
      then: { anyOf: [{ required: ['command'] }, { required: ['args'] }] },
    },
    {
      if: { properties: { type: { const: 'http' } } },
      then: { required: ['url'], properties: { url: { type: 'string', pattern: '^https?://' } } },
    },
    {
      if: { properties: { type: { const: 'prompt' } } },
      then: { required: ['prompt'] },
    },
  ],
} as const

export const hookSchema = {
  type: 'object',
  required: ['type', 'actions'],
  properties: {
    type: { enum: HOOK_TYPES },
    actions: { type: 'array', items: hookActionSchema },
  },
} as const

export const validateHookAction = ajv.compile(hookActionSchema)
export const validateHookSchema = ajv.compile(hookSchema)

/** 把 ajv 错误压成人类可读的一行行（instancePath + message）。 */
function formatErrors(errors?: ErrorObject[] | null): string[] {
  if (!errors?.length) return []
  return errors.map((e) => {
    const where = e.instancePath || '(root)'
    return `${where} ${e.message ?? 'invalid'}`.trim()
  })
}

/** 校验整个 Hook（含每个 action）。返回 { valid, errors }，errors 为可读消息数组。 */
export function validateHook(hook: Hook): { valid: boolean; errors: string[] } {
  const valid = validateHookSchema(hook as unknown) as boolean
  return { valid, errors: valid ? [] : formatErrors(validateHookSchema.errors) }
}

/** 校验单个 action（http 必须有 http(s) url，command 必须有 command 或 args，prompt 必须有 prompt）。
 *  接受运行时对象（settings 序列化后的形状或 domain HookAction），由 ajv 在运行时按 schema 校验。 */
export function validateAction(action: unknown): { valid: boolean; errors: string[] } {
  const valid = validateHookAction(action) as boolean
  return { valid, errors: valid ? [] : formatErrors(validateHookAction.errors) }
}
