// forge/src/lib/launchStore.ts
// 轻量全局 launch-request store（无 Zustand 依赖，module-level 单例）
// 用于 Sessions/Projects 页向 Runner 页传递"待启动 PTY"请求。

export interface LaunchRequest {
  tool: string          // "claude-code" | "codex-cli"
  workingDir: string
  extraArgs?: string[]  // 例如 ["--resume", "<sessionId>"]
}

type Subscriber = (req: LaunchRequest | null) => void

let _request: LaunchRequest | null = null
const _subs: Set<Subscriber> = new Set()

export const launchStore = {
  /** Sessions/Projects 页调用：设置待启动请求，并导航到 runner 页 */
  set(req: LaunchRequest) {
    _request = req
    _subs.forEach(fn => fn(_request))
  },

  /** Runner 页调用：消费请求（消费后清空） */
  consume(): LaunchRequest | null {
    const r = _request
    _request = null
    return r
  },

  /** Runner 页 useEffect 订阅变更 */
  subscribe(fn: Subscriber): () => void {
    _subs.add(fn)
    return () => _subs.delete(fn)
  },
}
