import type { TFunction } from 'i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { KeyValueRows } from '@/components/KeyValueRows'
import { Terminal, Code, Globe, Plus, Trash2 } from 'lucide-react'

export type HookActionItemType = 'command' | 'http' | 'prompt'

/** Per-action editing model used by the Hooks edit dialog. */
export interface HookActionItem {
  type: HookActionItemType
  // command form
  command: string
  args: string[]
  useScriptFile: boolean
  scriptPath: string
  scriptContent: string
  // http form
  url: string
  method: 'POST' | 'GET' | 'PUT'
  headers: Array<{ key: string; value: string }>
  body: string
  // prompt form
  prompt: string
  // common
  timeout: number
  continueOnError: boolean
  continueOnBlock: boolean
  terminalSequence: string
}

export function makeEmptyAction(): HookActionItem {
  return {
    type: 'command',
    command: '',
    args: [],
    useScriptFile: false,
    scriptPath: '',
    scriptContent: '',
    url: '',
    method: 'POST',
    headers: [],
    body: '',
    prompt: '',
    timeout: 60000,
    continueOnError: false,
    continueOnBlock: false,
    terminalSequence: '',
  }
}

interface HookActionFormProps {
  action: HookActionItem
  index: number
  canRemove: boolean
  onChange: (action: HookActionItem) => void
  onRemove: () => void
  t: TFunction
}

export function HookActionForm({ action, index, canRemove, onChange, onRemove, t }: HookActionFormProps) {
  const patch = (partial: Partial<HookActionItem>) => onChange({ ...action, ...partial })

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('dialog.command', 'Command')} {index + 1}</span>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">{t('dialog.commandType', 'Type')}</Label>
            <Select
              value={action.type}
              onValueChange={(value: HookActionItemType) => {
                const next: Partial<HookActionItem> = { type: value }
                if (value !== 'command') next.useScriptFile = false
                patch(next)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="command">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    {t('dialog.typeCommand', 'Shell Command')}
                  </div>
                </SelectItem>
                <SelectItem value="http">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    {t('dialog.typeHttp', 'HTTP')}
                  </div>
                </SelectItem>
                <SelectItem value="prompt">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    {t('dialog.typePrompt', 'Prompt')}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('dialog.timeout', 'Timeout (ms)')}</Label>
            <Input
              type="number"
              value={action.timeout}
              onChange={(e) => patch({ timeout: parseInt(e.target.value) || 60000 })}
            />
          </div>
        </div>

        {/* ---- command form ---- */}
        {action.type === 'command' && (
          <>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`use-script-${index}`}
                checked={action.useScriptFile}
                onChange={(e) => {
                  const checked = e.target.checked
                  const next: Partial<HookActionItem> = { useScriptFile: checked }
                  if (checked && !action.scriptPath) {
                    next.scriptPath = '.claude/hooks/my-hook.sh'
                    next.scriptContent = `#!/bin/bash\n# Hook script\necho "Hook executed"\n`
                  }
                  patch(next)
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor={`use-script-${index}`} className="text-xs cursor-pointer">
                {t('dialog.useScriptFile', 'Create script file (.sh)')}
              </Label>
            </div>

            {action.useScriptFile ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">{t('dialog.scriptPath', 'Script Path')}</Label>
                  <Input
                    value={action.scriptPath}
                    onChange={(e) => patch({ scriptPath: e.target.value })}
                    placeholder=".claude/hooks/my-script.sh"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('dialog.scriptPathHint', 'Relative path from ~/.claude or project root')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t('dialog.scriptContent', 'Script Content')}</Label>
                  <Textarea
                    value={action.scriptContent}
                    onChange={(e) => patch({ scriptContent: e.target.value })}
                    placeholder={`#!/bin/bash\n# Your hook script here\necho "Hello from hook"`}
                    className="font-mono text-sm min-h-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('dialog.scriptContentHint', 'The script will be created with executable permissions')}
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">{t('dialog.shellCommand', 'Shell Command')}</Label>
                <Textarea
                  value={action.command}
                  onChange={(e) => patch({ command: e.target.value })}
                  placeholder={t('dialog.shellCommandPlaceholder', 'echo "Hook executed" or path/to/script.sh')}
                  className="font-mono text-sm min-h-[80px]"
                />
              </div>
            )}

            {/* args (exec form) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t('dialog.args', 'Arguments (exec form)')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => patch({ args: [...action.args, ''] })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('dialog.addArg', 'Add Arg')}
                </Button>
              </div>
              {action.args.map((arg, ai) => (
                <div key={ai} className="flex gap-2">
                  <Input
                    value={arg}
                    onChange={(e) => {
                      const args = [...action.args]
                      args[ai] = e.target.value
                      patch({ args })
                    }}
                    placeholder={ai === 0 ? 'node' : 'arg'}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => patch({ args: action.args.filter((_, i) => i !== ai) })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---- http form ---- */}
        {action.type === 'http' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2 col-span-2">
                <Label className="text-xs">{t('dialog.url', 'URL')}</Label>
                <Input
                  value={action.url}
                  onChange={(e) => patch({ url: e.target.value })}
                  placeholder="https://example.com/hook"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t('dialog.method', 'Method')}</Label>
                <Select
                  value={action.method}
                  onValueChange={(value: 'POST' | 'GET' | 'PUT') => patch({ method: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t('dialog.headers', 'Headers')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => patch({ headers: [...action.headers, { key: '', value: '' }] })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('dialog.addHeader', 'Add Header')}
                </Button>
              </div>
              <KeyValueRows
                rows={action.headers}
                onChange={(headers) => patch({ headers })}
                keyPlaceholder={t('dialog.headerKey', 'Header name')}
                valuePlaceholder={t('dialog.headerValue', 'Header value')}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{t('dialog.body', 'Body')}</Label>
              <Textarea
                value={action.body}
                onChange={(e) => patch({ body: e.target.value })}
                placeholder={t('dialog.bodyPlaceholder', 'Request body template (supports ${...}); leave empty to send full hook input JSON')}
                className="font-mono text-sm min-h-[80px]"
              />
            </div>
          </>
        )}

        {/* ---- prompt form ---- */}
        {action.type === 'prompt' && (
          <div className="space-y-2">
            <Label className="text-xs">{t('dialog.promptText', 'Prompt Text')}</Label>
            <Textarea
              value={action.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              placeholder={t('dialog.promptPlaceholder', 'Enter prompt text...')}
              className="font-mono text-sm min-h-[80px]"
            />
          </div>
        )}

        {/* ---- common advanced ---- */}
        <div className="space-y-3 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t('dialog.advanced', 'Advanced')}</p>
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor={`continue-error-${index}`}>
              {t('dialog.continueOnError', 'Continue on Error')}
            </Label>
            <Switch
              id={`continue-error-${index}`}
              checked={action.continueOnError}
              onCheckedChange={(v) => patch({ continueOnError: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor={`continue-block-${index}`}>
              {t('dialog.continueOnBlock', 'Continue on Block')}
            </Label>
            <Switch
              id={`continue-block-${index}`}
              checked={action.continueOnBlock}
              onCheckedChange={(v) => patch({ continueOnBlock: v })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('dialog.terminalSequence', 'Terminal Sequence')}</Label>
            <Input
              value={action.terminalSequence}
              onChange={(e) => patch({ terminalSequence: e.target.value })}
              placeholder={t('dialog.terminalSequencePlaceholder', 'Escape sequence written to terminal on trigger')}
              className="font-mono text-sm"
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
