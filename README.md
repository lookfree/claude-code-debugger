# Claude Code Debugger & Manager

A powerful desktop application for debugging and managing Claude Code skills, agents, hooks, MCP servers, and slash commands.

## Features

- 🔍 **Skills Debugger**: Browse, search, and analyze Claude Code skills with detailed information
- 🤖 **Agents Manager**: Manage and debug Claude Code subagents
- 🪝 **Hooks Manager**: Configure and test hook execution chains
- 🌐 **MCP Server Manager**: Manage Model Context Protocol servers and test connections
- ⚡ **Commands Manager**: Create and test custom slash commands
- 📊 **Dependency Graph**: Visualize component dependencies and relationships
- ✏️ **Visual Editors**: Edit configurations through intuitive UI instead of manual JSON editing
- 📈 **Performance Analysis**: Track execution times, resource usage, and bottlenecks
- 🔄 **Version Control**: Configuration change history and rollback
- 🤝 **Team Collaboration**: Share configurations and templates

## Technology Stack

- **Desktop**: Electron
- **Frontend**: React 18 + TypeScript
- **UI**: shadcn/ui + Tailwind CSS + Radix UI
- **State**: Zustand
- **Visualization**: React Flow
- **Editor**: Monaco Editor
- **Database**: SQLite (for logs and history)

## Project Structure

```
claude-code-debugger/
├── electron/           # Electron main process
│   ├── main.ts        # Main entry point
│   ├── preload.ts     # Preload script
│   ├── services/      # Core services
│   └── ipc/           # IPC handlers
├── src/               # React frontend
│   ├── components/    # UI components
│   ├── pages/         # Page components
│   ├── stores/        # State management
│   ├── lib/           # Utilities
│   └── types/         # TypeScript types
├── shared/            # Shared code
│   └── types/         # Shared types
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Run in development mode (Electron + Vite hot reload)
npm run electron:dev
```

### Building

```bash
# Build for production
npm run electron:build
```

This will create distributable packages in the `release/` directory.

## Usage

1. **Launch the Application**: Start the app and it will automatically detect your Claude Code configuration
2. **Browse Components**: Navigate through Skills, Agents, Hooks, MCP Servers, and Commands
3. **View Dependencies**: Use the Dependency Graph to understand relationships
4. **Edit Configurations**: Use visual editors to modify configurations
5. **Test & Debug**: Test MCP connections, run hooks, and debug executions

## Configuration

The app reads configuration from:
- **Project**: `.claude/` directory in your project
- **Global**: `~/.claude/` in your home directory

Supported configuration files:
- `skills/*.json` - Skill definitions
- `agents/*.json` - Agent configurations
- `hooks/*.json` - Hook definitions
- `commands/*.json` - Slash command definitions
- `mcpServers.json` - MCP server configurations
- `CLAUDE.md` - Project documentation

## Development Roadmap

- [x] Project setup and architecture
- [x] Type definitions
- [x] Electron main process and IPC
- [x] React frontend basics
- [x] Skills browser
- [ ] Agents manager
- [ ] Hooks manager
- [ ] MCP server manager
- [ ] Commands manager
- [ ] Dependency graph visualization
- [ ] Visual editors
- [ ] Performance monitoring
- [ ] Version control integration
- [ ] AI-assisted configuration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Author

Built with ❤️ for the Claude Code community
