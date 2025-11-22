# Claude Code Debugger & Manager

A desktop application for debugging and managing Claude Code skills, subagents, hooks, MCP servers, and slash commands.

## Overview

This Electron-based desktop application provides a visual interface for managing all Claude Code components. It allows developers to browse, inspect, test, and manage skills, agents, hooks, MCP servers, and slash commands through an intuitive UI.

## Project Structure

```
skills-ui/
├── electron/              # Electron main process
│   ├── main.ts           # Main process entry point
│   ├── preload.cjs       # Preload script (CommonJS)
│   ├── ipc.ts            # IPC handlers
│   └── services/         # Backend services
│       └── file-manager.ts  # File system operations
├── src/                  # React frontend
│   ├── App.tsx          # Main app component
│   ├── pages/           # Page components
│   │   ├── Skills.tsx   # Skills browser
│   │   ├── Agents.tsx   # Agents manager
│   │   ├── Hooks.tsx    # Hooks configurator
│   │   ├── MCP.tsx      # MCP servers manager
│   │   └── Commands.tsx # Slash commands editor
│   ├── components/      # Reusable UI components
│   └── lib/            # Utilities and API client
├── shared/              # Shared TypeScript types
│   └── types/          # Type definitions
└── dist-electron/       # Built electron files

```

## File Structure

- `electron/` - Main process code that runs in Node.js context
  - `main.ts` - Creates browser window, manages app lifecycle
  - `preload.cjs` - Exposes safe IPC APIs to renderer via contextBridge
  - `ipc.ts` - Registers all IPC handlers for frontend communication
  - `services/file-manager.ts` - Handles reading/writing skills, agents, etc.

- `src/` - Renderer process code that runs in browser context
  - `pages/` - Full-page components for each section
  - `components/` - Reusable UI components (buttons, lists, forms)
  - `lib/api.ts` - Frontend API client that wraps electronAPI calls

- `shared/types/` - TypeScript interfaces shared between main and renderer

## Setup & Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- macOS, Windows, or Linux

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd skills-ui

# Install dependencies
npm install

# Start development server
npm run electron:dev
```

### Development

The app runs in development mode with hot reload:

```bash
npm run electron:dev
```

This starts:
1. Vite dev server on http://localhost:5173
2. Electron app that loads the dev server

### Build

```bash
# Build for production
npm run build

# Build electron binaries
npm run electron:build
```

## Architecture

### IPC Communication

The app uses Electron's IPC (Inter-Process Communication) for frontend-backend communication:

```
Frontend (React)
    ↓ electronAPI.getSkills()
Preload Script (contextBridge)
    ↓ ipcRenderer.invoke('skills:getAll')
Main Process (IPC Handlers)
    ↓ FileManager.getSkills()
File System (~/.claude/)
```

### Security Model

- **Context Isolation**: Enabled - renderer has no direct Node.js access
- **Node Integration**: Disabled - no Node APIs in renderer
- **Preload Script**: Acts as security bridge using contextBridge
- **Sandbox**: Disabled (required for preload to work)

### File Manager Service

Manages all file operations for Claude Code components:

- **Skills**: Scans `~/.claude/plugins/marketplaces/anthropic-agent-skills/*/SKILL.md` and `~/.claude/skills/*/SKILL.md`
- **Agents**: Manages agent configurations
- **Hooks**: Handles hook scripts
- **MCP Servers**: Manages MCP server configs
- **Slash Commands**: Manages command definitions

## Tech Stack

### Core
- **Electron** - Desktop application framework
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server

### UI & Styling
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - Component library
- **Lucide React** - Icon library

### State Management
- **Zustand** - Lightweight state management
- **React Router** - Client-side routing

### Build Tools
- **vite-plugin-electron** - Electron integration for Vite
- **vite-plugin-electron-renderer** - Renderer process support

## Development Workflow

### Adding a New Feature

1. **Define Types** in `shared/types/` if needed
2. **Create IPC Handler** in `electron/ipc.ts`
3. **Implement Service Logic** in `electron/services/`
4. **Expose API** in `electron/preload.cjs`
5. **Add Frontend API** in `src/lib/api.ts`
6. **Create UI Components** in `src/pages/` or `src/components/`

### Example: Adding Agents Page

```typescript
// 1. Define types in shared/types/agent.ts
export interface Agent {
  name: string
  description: string
  // ...
}

// 2. Add IPC handler in electron/ipc.ts
ipcMain.handle('agents:getAll', async () => {
  return fileManager.getAgents()
})

// 3. Expose in preload.cjs
contextBridge.exposeInMainWorld('electronAPI', {
  getAgents: () => ipcRenderer.invoke('agents:getAll'),
  // ...
})

// 4. Add to frontend API in src/lib/api.ts
export const api = {
  agents: {
    getAll: () => window.electronAPI.getAgents(),
    // ...
  }
}

// 5. Create page component in src/pages/Agents.tsx
export function Agents() {
  const [agents, setAgents] = useState([])
  // ...
}
```

## Testing

### Manual Testing

1. Start dev server: `npm run electron:dev`
2. Open DevTools in the Electron window
3. Check console logs for errors
4. Test each feature manually

### Debug Logs

All components include extensive logging:

- `[Main]` - Main process logs
- `[Preload]` - Preload script logs
- `[FileManager]` - File manager service logs
- `[IPC]` - IPC handler logs
- `[API]` - Frontend API logs
- `[Skills Page]` - Page component logs

## Error Handling

### Common Issues

**Preload Script Not Loading**
- Ensure `preload.cjs` is CommonJS (uses `require()`, not `import`)
- Check file exists at path logged by main process
- Verify path in `electron/main.ts` is correct

**electronAPI Undefined**
- Check DevTools console for preload errors
- Verify preload script is executing (check console logs)
- Ensure contextBridge.exposeInMainWorld is called

**Skills Not Loading**
- Check `~/.claude/` directory exists
- Verify SKILL.md files are present
- Check FileManager logs for parsing errors

### Error Patterns

All errors should be caught and logged:

```typescript
try {
  const skills = await fileManager.getSkills()
  console.log('[IPC] Found', skills.length, 'skills')
  return skills
} catch (error) {
  console.error('[IPC] Error getting skills:', error)
  return []
}
```

## Common Commands

```bash
# Development
npm run electron:dev          # Start dev server with hot reload

# Build
npm run build                 # Build renderer (React app)
npm run electron:build        # Build electron app

# Debugging
npm run electron:dev 2>&1 | tee /tmp/electron.log  # Log all output

# Clean
rm -rf dist-electron dist node_modules/.vite       # Clean build artifacts
```

## Core Principles

1. **Security First** - Use context isolation and IPC for all communication
2. **Type Safety** - Share types between main and renderer processes
3. **Extensive Logging** - Log all operations for debugging
4. **Error Handling** - Never crash, always return empty arrays/objects on error
5. **User Experience** - Provide immediate feedback for all actions

## Roadmap

- [ ] Agents page implementation
- [ ] Hooks configuration and testing
- [ ] MCP servers management and testing
- [ ] Slash commands editor
- [ ] Dependency graph visualization
- [ ] Real-time file watching and updates
- [ ] Export/import functionality
- [ ] Search and filtering across all components
