import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export interface KVRow { key: string; value: string }

/**
 * key/value 动态行编辑（headers / env 等）。调用方自管标签与「添加」按钮（`onChange([...rows, {key:'',value:''}])`），
 * 本组件只渲染重复的行（两个 Input + 删除 + 不可变更新）。MCP headers / Hook http headers 等共用。
 */
export function KeyValueRows({ rows, onChange, keyPlaceholder = 'key', valuePlaceholder = 'value' }: {
  rows: KVRow[]
  onChange: (rows: KVRow[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}) {
  const set = (i: number, patch: Partial<KVRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1">
          <Input className="w-40 font-mono text-xs" value={r.key} placeholder={keyPlaceholder} onChange={(e) => set(i, { key: e.target.value })} />
          <Input className="flex-1 font-mono text-xs" value={r.value} placeholder={valuePlaceholder} onChange={(e) => set(i, { value: e.target.value })} />
          <Button type="button" variant="ghost" size="sm" className="h-9 w-8 p-0 shrink-0" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <X className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  )
}
