// forge/src/modules/codex-cli/pages/Projects.tsx
import ClaudeCodeProjects from '../../claude-code/pages/Projects'

interface Props { onNavigate?: (id: string) => void }
export default function CodexProjects({ onNavigate }: Props) {
  return <ClaudeCodeProjects tool="codex-cli" onNavigate={onNavigate} />
}
