import type { IpcMain } from 'electron'
import Ajv from 'ajv'

const ajv = new Ajv()

// Define JSON schemas for validation
const skillSchema = {
  type: 'object',
  required: ['name', 'type', 'description', 'implementation'],
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['skill'] },
    description: { type: 'string' },
    enabled: { type: 'boolean' },
    implementation: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['hook', 'agent', 'command', 'inline'] },
        handler: { type: 'string' },
        instructions: { type: 'string' },
        code: { type: 'string' },
      },
    },
  },
}

const agentSchema = {
  type: 'object',
  required: ['name', 'type', 'description', 'enabled', 'trigger', 'instructions', 'capabilities'],
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['subagent'] },
    description: { type: 'string' },
    enabled: { type: 'boolean' },
    trigger: {
      type: 'object',
      required: ['type'],
    },
    instructions: { type: 'string' },
    capabilities: {
      type: 'object',
      required: ['canModifyFiles', 'canRunCommands', 'canCommit', 'scope'],
    },
  },
}

export function registerValidationHandlers(ipcMain: IpcMain) {
  ipcMain.handle('validate:config', async (_event, type: string, config: unknown) => {
    let schema
    switch (type) {
      case 'skill':
        schema = skillSchema
        break
      case 'agent':
        schema = agentSchema
        break
      default:
        return { valid: false, errors: [`Unknown config type: ${type}`] }
    }

    const validate = ajv.compile(schema)
    const valid = validate(config)

    if (!valid) {
      return {
        valid: false,
        errors: validate.errors?.map((e) => `${e.instancePath} ${e.message}`) || [],
      }
    }

    return { valid: true }
  })
}
