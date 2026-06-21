import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** 来源染色：user 绿 / project 蓝 / plugin 紫。Skills/Commands 等三层来源页共用（spec004/006）。 */
export const SOURCE_BADGE_CLASS: Record<string, string> = {
  user: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  project: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  plugin: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
}

/** 来源 Badge：调用方按各自 i18n namespace 算好 label 传入（plugin 通常带 pluginName@version）。 */
export function SourceBadge({ source, label }: { source: string; label: string }) {
  return (
    <Badge variant="outline" className={cn('text-xs', SOURCE_BADGE_CLASS[source])}>
      {label}
    </Badge>
  )
}
