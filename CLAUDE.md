# Claude Code Debugger & Manager

A desktop application for debugging and managing Claude Code skills, subagents, hooks, MCP servers, and slash commands.

## Overview

This Electron-based desktop application provides a visual interface for managing all Claude Code components. It allows developers to browse, inspect, test, and manage skills, agents, hooks, MCP servers, and slash commands through an intuitive UI.

## Project Structure

```
claude-code-debugger/
├── electron/              # Electron main process
│   ├── main.ts           # Main process entry point
│   ├── preload.cjs       # Preload script (CommonJS)
│   ├── ipc/              # IPC handlers (modular)
│   │   ├── index.ts      # Main IPC registry
│   │   ├── skills.ts     # Skills IPC handlers
│   │   ├── hooks.ts      # Hooks IPC handlers
│   │   ├── mcp.ts        # MCP IPC handlers
│   │   ├── commands.ts   # Commands IPC handlers
│   │   ├── agents.ts     # Agents IPC handlers
│   │   └── claudemd.ts   # CLAUDE.md IPC handlers
│   └── services/         # Backend services
│       └── file-manager.ts  # File system operations
├── src/                  # React frontend
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # Entry point with i18n init
│   ├── i18n/            # Internationalization
│   │   ├── index.ts     # i18n configuration
│   │   ├── config.ts    # Language settings
│   │   └── locales/     # Translation files
│   │       ├── en/      # English translations
│   │       │   ├── common.json
│   │       │   ├── layout.json
│   │       │   └── dashboard.json
│   │       └── zh/      # Chinese translations
│   │           ├── common.json
│   │           ├── layout.json
│   │           └── dashboard.json
│   ├── pages/           # Page components
│   │   ├── Dashboard.tsx   # Dashboard overview
│   │   ├── Skills.tsx      # Skills browser
│   │   ├── Agents.tsx      # Agents manager
│   │   ├── Hooks.tsx       # Hooks configurator
│   │   ├── MCP.tsx         # MCP servers manager
│   │   ├── Commands.tsx    # Slash commands editor
│   │   ├── ClaudeMd.tsx    # CLAUDE.md file manager
│   │   ├── Graph.tsx       # Dependency graph
│   │   └── Settings.tsx    # Settings page
│   ├── components/      # Reusable UI components
│   │   ├── layout/
│   │   │   ├── Layout.tsx          # Main layout
│   │   │   └── LanguageSwitcher.tsx # Language selector
│   │   └── ui/          # shadcn/ui components
│   ├── stores/          # State management
│   │   └── languageStore.ts  # Language state (Zustand)
│   └── lib/            # Utilities and API client
│       ├── api.ts      # Frontend API wrapper
│       └── utils.ts    # Utility functions
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

### Internationalization
- **i18next** - Internationalization framework
- **react-i18next** - React bindings for i18next
- **i18next-browser-languagedetector** - Automatic language detection

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

## Features

### ✅ Implemented Features

- **Multi-language Support** - English and Chinese with seamless switching
- **Dashboard** - Overview of all Claude Code components
- **CLAUDE.md Manager** - Browse and edit CLAUDE.md files across projects
- **Skills Browser** - View and manage Claude Code skills
- **Commands Manager** - Manage slash commands
- **MCP Servers** - Configure and manage MCP servers
- **Hooks Manager** - Configure and test hooks
- **Dependency Graph** - Visualize component relationships
- **Settings** - Application configuration
- **Language Switcher** - Easy language selection in sidebar

### 🔧 Recent Fixes

- **Graph.tsx Null Safety** - Fixed node data structure inconsistency
  - Updated node type definitions to use nested `data` structure
  - Added defensive checks for undefined node.data access
  - Resolved "Cannot read properties of undefined (reading 'label')" error

- **Internationalization (i18n)** - Complete Chinese and English support
  - Automatic language detection from browser/localStorage
  - Persistent language selection
  - Seamless language switching without page reload
  - TypeScript support for translation keys

## Internationalization (i18n)

### Language Support

The application supports multiple languages with easy switching:

- **Supported Languages**: English (en), Chinese (zh)
- **Default Language**: English
- **Detection**: Auto-detects browser language on first load
- **Persistence**: Selected language saved to localStorage

### Translation Structure

```
src/i18n/locales/
├── en/
│   ├── common.json      # Buttons, labels, messages
│   ├── layout.json      # Navigation, app title
│   └── dashboard.json   # Dashboard page
└── zh/
    ├── common.json
    ├── layout.json
    └── dashboard.json
```

### Adding New Translations

1. **Add translation files** for new pages:
```bash
# Create translation files
touch src/i18n/locales/en/newpage.json
touch src/i18n/locales/zh/newpage.json
```

2. **Import in `src/i18n/index.ts`**:
```typescript
import newpageEn from './locales/en/newpage.json'
import newpageZh from './locales/zh/newpage.json'

export const resources = {
  en: {
    // ...
    newpage: newpageEn,
  },
  zh: {
    // ...
    newpage: newpageZh,
  },
}
```

3. **Use in components**:
```typescript
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation('newpage')
  return <h1>{t('title')}</h1>
}
```

### Translation Best Practices

- **Namespace by page**: Use separate JSON files for each page
- **Common translations**: Put shared text in `common.json`
- **Structured keys**: Use nested objects for organization
- **Dynamic values**: Use interpolation `{{variable}}`
- **Pluralization**: Use i18next plural rules when needed

Example translation file:
```json
{
  "title": "Page Title",
  "button": {
    "save": "Save",
    "cancel": "Cancel"
  },
  "message": {
    "success": "Operation successful",
    "error": "An error occurred"
  },
  "dynamicText": "Welcome, {{name}}!"
}
```

## Roadmap

### High Priority
- [ ] Complete i18n for all pages (Skills, Commands, MCP, Hooks, etc.)
- [ ] Real-time file watching and auto-refresh
- [ ] Export/import functionality for configurations

### Medium Priority
- [ ] Search and filtering across all components
- [ ] Agents page full implementation
- [ ] Testing and debugging tools integration
- [ ] Performance optimization and caching

### Low Priority
- [ ] Dark/Light theme support
- [ ] Keyboard shortcuts
- [ ] Configuration backup and restore
- [ ] Plugin system for extensions
