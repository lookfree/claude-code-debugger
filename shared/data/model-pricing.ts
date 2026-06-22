import type { TokenUsage } from '../types/session'

/**
 * 模型单价表（USD / 百万 token）。⚠ 估算值，会过时——模型与定价频繁变。
 * 集中此一处维护；理想接 claude-api skill 的权威单价。更新于下方 PRICING_UPDATED。
 * cache_read 通常约 0.1× input、cache_write 约 1.25× input（分开计费，别用一个单价）。
 */
export const PRICING_UPDATED = '2026-06-21'

export interface ModelPrice {
  inputPerM: number
  outputPerM: number
  cacheWritePerM: number
  cacheReadPerM: number
}

/** 按模型串关键字匹配（保留原串做分组，仅匹配时小写）。靠前优先。 */
const TABLE: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /opus/i, price: { inputPerM: 15, outputPerM: 75, cacheWritePerM: 18.75, cacheReadPerM: 1.5 } },
  { match: /sonnet/i, price: { inputPerM: 3, outputPerM: 15, cacheWritePerM: 3.75, cacheReadPerM: 0.3 } },
  { match: /haiku/i, price: { inputPerM: 0.8, outputPerM: 4, cacheWritePerM: 1, cacheReadPerM: 0.08 } },
  // fable 单价未公布，暂按 sonnet 档估（标注估算）
  { match: /fable/i, price: { inputPerM: 3, outputPerM: 15, cacheWritePerM: 3.75, cacheReadPerM: 0.3 } },
]

export function priceFor(model: string): ModelPrice | undefined {
  return TABLE.find((t) => t.match.test(model))?.price
}

/** 按单价表估算一段用量的成本（USD）；未知模型返回 undefined。 */
export function estimateCostUsd(u: Pick<TokenUsage, 'inputTokens' | 'outputTokens' | 'cacheCreationInputTokens' | 'cacheReadInputTokens'>, model: string): number | undefined {
  const p = priceFor(model)
  if (!p) return undefined
  return (
    (u.inputTokens * p.inputPerM +
      u.outputTokens * p.outputPerM +
      u.cacheCreationInputTokens * p.cacheWritePerM +
      u.cacheReadInputTokens * p.cacheReadPerM) /
    1_000_000
  )
}

/** 对 byModel 映射求总成本（逐 model 用各自单价，未知模型跳过）。 */
export function estimateCostByModel(byModel: Record<string, TokenUsage>): number {
  let cost = 0
  for (const [model, u] of Object.entries(byModel)) {
    cost += estimateCostUsd(u, model) ?? 0
  }
  return cost
}
