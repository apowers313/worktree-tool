# wtt - Git Worktree Tool

A cross-platform git worktree management tool optimized for AI development workflows.

## Features

- Simple worktree creation and management
- Optional tmux integration for session management
- Cross-platform support (Windows, macOS, Linux)
- Self-hosting capable - use wtt to develop wtt

## Installation

```bash
npm install -g wtt
```

## Usage

### Initialize a repository for worktree management
```bash
wtt init
```

### Create a new worktree
```bash
wtt create --name feature-awesome
```

## Development

This project uses wtt for its own development:

```bash
# Build the project
npm run build

# Run tests
npm test

# Run in development mode
npm run dev
```

## License

MIT