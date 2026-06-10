// forge/src/modules/codex-cli/pages/Sessions.tsx
import ClaudeCodeSessions from '../../claude-code/pages/Sessions'

interface Props { onNavigate?: (id: string) => void }
export default function CodexSessions({ onNavigate }: Props) {
  return <ClaudeCodeSessions tool="codex-cli" onNavigate={onNavigate} />
}
