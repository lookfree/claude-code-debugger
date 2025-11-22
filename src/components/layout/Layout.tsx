import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  Zap,
  Bot,
  Webhook,
  Server,
  Terminal,
  LayoutDashboard,
  GitBranch,
  Settings,
  FileText,
} from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'CLAUDE.md', href: '/claude-md', icon: FileText },
  { name: 'Commands', href: '/commands', icon: Terminal },
  { name: 'Subagents', href: '/agents', icon: Bot },
  { name: 'MCP Servers', href: '/mcp', icon: Server },
  { name: 'Skills', href: '/skills', icon: Zap },
  { name: 'Hooks', href: '/hooks', icon: Webhook },
  { name: 'Dependency Graph', href: '/graph', icon: GitBranch },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center px-6">
          <h1 className="text-lg font-bold text-foreground">Claude Debugger</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <div className="text-xs text-muted-foreground">
            <p>Claude Code Debugger</p>
            <p className="mt-1">v0.1.0</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
