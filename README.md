# wtt - Git Worktree Tool

[![Coverage Status](https://coveralls.io/repos/github/apowers313/worktree-tool/badge.svg?branch=master)](https://coveralls.io/github/apowers313/worktree-tool?branch=master)
[![npm version](https://badge.fury.io/js/worktree-tool.svg)](https://www.npmjs.com/package/worktree-tool)

A command-line tool for managing Git worktrees with integrated tmux/shell session management.

## Features

- 🚀 Quick creation of Git worktrees with automatic branch management
- 🖥️ Automatic tmux session/window creation (when available)
- 🐚 Smart shell integration with custom prompts
- 📁 Organized worktree structure in `.worktrees/` directory
- 🔧 Simple configuration management
- 🌍 Cross-platform support (Linux, macOS, Windows)
- 🔄 Auto-run commands on worktree creation
- 🔌 Automatic port allocation for development servers
- 📊 Execute commands across multiple worktrees
- 🔤 Automatic tmux window sorting

## Installation

### From npm

```bash
npm install -g worktree-tool
```

### From source

```bash
git clone https://github.com/yourusername/worktree-tool.git
cd worktree-tool
npm install
npm run build
npm link
```

## Quick Start

1. Initialize wtt in your Git repository:

```bash
wtt init
```

2. Create a new worktree:

```bash
wtt create feature-awesome
```

This will:
- Create a new Git worktree at `.worktrees/feature-awesome`
- Create a new branch `feature-awesome`
- Open a new tmux window (if tmux is available) or shell with the worktree name in the prompt

## Commands

### `wtt init`

Initialize worktree management in the current repository.

**Options:**
- `--project-name <name>` - Override automatic project name detection
- `--base-dir <dir>` - Set base directory for worktrees (default: `.worktrees`)
- `--enable-tmux` - Force enable tmux integration
- `--disable-tmux` - Force disable tmux integration
- `--main-branch <branch>` - Override main branch detection

**Example:**
```bash
wtt init --project-name myapp --disable-tmux
```

### `wtt create <name>`

Create a new worktree with the given name.

**Example:**
```bash
wtt create feature-login
wtt create "fix user authentication"  # Spaces are automatically converted to hyphens
```

### `wtt exec [command]`

Execute a command in all (or specified) worktrees.

**Options:**
- `-w, --worktrees <worktrees>` - Comma-separated list of worktree names
- `--mode <mode>` - Execution mode: `window`, `inline`, `background`, or `exit`
- `--refresh` - Ensure autoRun commands are running and re-sort windows
- `-v, --verbose` - Show verbose output
- `-q, --quiet` - Suppress output

**Example:**
```bash
# Execute predefined command in all worktrees
wtt exec dev

# Execute command in specific worktrees
wtt exec build -w feature-a,feature-b

# Execute inline command
wtt exec -- npm test

# Refresh autoRun commands
wtt exec --refresh
```

### `wtt help [command]`

Display help information.

**Example:**
```bash
wtt help
wtt help init
```

## Configuration

wtt stores its configuration in `.worktreerc.json` at the repository root:

```json
{
  "version": "1.0.0",
  "projectName": "my-project",
  "mainBranch": "main",
  "baseDir": ".worktrees",
  "tmux": true,
  "autoSort": true,
  "availablePorts": "9000-9099",
  "commands": {
    "dev": {
      "command": "npm run dev",
      "mode": "window",
      "autoRun": true,
      "numPorts": 1
    },
    "test": "npm test"
  }
}
```

### Configuration Options

- `autoSort` (boolean) - Automatically sort tmux windows alphabetically (default: true)
- `availablePorts` (string) - Port range for automatic port allocation (e.g., "9000-9099")
- `commands` (object) - Predefined commands for use with `wtt exec`

### Command Configuration

Commands can be defined as either:
- A simple string: `"test": "npm test"`
- An object with options:
  - `command` (string) - The command to execute
  - `mode` (string) - Execution mode: `window`, `inline`, `background`, or `exit`
  - `autoRun` (boolean) - Run automatically when creating new worktrees
  - `numPorts` (number) - Number of ports to allocate (sets `WTT_PORT1`, `WTT_PORT2`, etc.)

### Port Allocation

When `availablePorts` is configured and a command has `numPorts` set, wtt will:
1. Find available ports in the specified range
2. Set environment variables `WTT_PORT1`, `WTT_PORT2`, etc.
3. Pass these to the executed command

This is useful for running development servers on different ports in each worktree.

### Auto-Run Commands

Commands with `autoRun: true` will automatically execute when:
1. A new worktree is created with `wtt create`
2. You run `wtt exec --refresh` to restart any stopped commands

This is perfect for starting development servers, watchers, or other long-running processes.

## Requirements

- Node.js >= 18.0.0
- Git
- tmux (optional, for session management)

## Development

This project uses wtt for its own development:

```bash
# Clone the repository
git clone https://github.com/yourusername/worktree-tool.git
cd worktree-tool

# Install dependencies
npm install

# Build the project
npm run build

# Initialize wtt for self-hosting
wtt init --project-name=wtt

# Create a worktree for development
wtt create feature-new-command

# Run tests
npm test
npm run test:integration
npm run test:e2e

# Run in development mode
npm run dev -- help
```

### Scripts

- `npm run build` - Build the TypeScript project
- `npm test` - Run unit tests
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

### Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Use `npx cz` to commit changes with the interactive commit helper.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
