# wtt - Git Worktree Tool

A command-line tool for managing Git worktrees with integrated tmux/shell session management.

## Features

- 🚀 Quick creation of Git worktrees with automatic branch management
- 🖥️ Automatic tmux session/window creation (when available)
- 🐚 Smart shell integration with custom prompts
- 📁 Organized worktree structure in `.worktrees/` directory
- 🔧 Simple configuration management
- 🌍 Cross-platform support (Linux, macOS, Windows)
- 🤖 Self-hosting capable - use wtt to develop wtt

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

### `wtt help [command]`

Display help information.

**Example:**
```bash
wtt help
wtt help init
```

## Configuration

wtt stores its configuration in `.worktree-config.json` at the repository root:

```json
{
  "version": "1.0.0",
  "projectName": "my-project",
  "mainBranch": "main",
  "baseDir": ".worktrees",
  "tmux": true
}
```

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