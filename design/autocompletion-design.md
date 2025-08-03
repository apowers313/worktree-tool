# Auto-Completion Design for wtt

## Overview

This document outlines the design for implementing shell auto-completion for the worktree tool (wtt). The goal is to provide seamless tab completion for commands, subcommands, options, and context-aware arguments across all supported shells.

## Shell Support Analysis

### Bash

**Supports Auto-Completion:** ✅ Yes

**Implementation Method:**
- Uses the `complete` built-in command
- Completion scripts typically placed in `/etc/bash_completion.d/` (system-wide) or `~/.local/share/bash-completion/completions/` (user-specific)
- Supports function-based completion with `complete -F`
- Key variables: `COMP_WORDS`, `COMP_CWORD`, `COMPREPLY`

**Example Implementation:**
```bash
_wtt_completions() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local prev="${COMP_WORDS[COMP_CWORD-1]}"
    
    # Commands
    local commands="init create switch list remove help"
    
    # Complete commands
    if [[ ${COMP_CWORD} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
        return 0
    fi
    
    # Context-aware completion based on command
    case "${COMP_WORDS[1]}" in
        switch|remove)
            # Complete with worktree names
            local worktrees="$(wtt list --format=names 2>/dev/null)"
            COMPREPLY=( $(compgen -W "${worktrees}" -- ${cur}) )
            ;;
    esac
}
complete -F _wtt_completions wtt
```

### Zsh

**Supports Auto-Completion:** ✅ Yes

**Implementation Method:**
- Uses the `compdef` system
- Completion files start with underscore (e.g., `_wtt`)
- Placed in directories in `$fpath`
- Supports sophisticated context-aware completion
- Uses `#compdef` directive

**Example Implementation:**
```zsh
#compdef wtt

_wtt() {
    local -a commands
    commands=(
        'init:Initialize a new worktree configuration'
        'create:Create a new worktree'
        'switch:Switch to a different worktree'
        'list:List all worktrees'
        'remove:Remove a worktree'
        'help:Show help information'
    )
    
    _arguments \
        '1: :->command' \
        '*::arg:->args'
    
    case $state in
        command)
            _describe 'command' commands
            ;;
        args)
            case $words[1] in
                switch|remove)
                    # Complete with worktree names
                    local -a worktrees
                    worktrees=(${(f)"$(wtt list --format=names 2>/dev/null)"})
                    _describe 'worktree' worktrees
                    ;;
            esac
            ;;
    esac
}

_wtt "$@"
```

### Fish

**Supports Auto-Completion:** ✅ Yes

**Implementation Method:**
- Uses the `complete` command
- Completion files named `<command>.fish`
- Placed in `~/.config/fish/completions/`
- Very readable syntax
- Supports conditional completions with `-n`

**Example Implementation:**
```fish
# ~/.config/fish/completions/wtt.fish

# Disable file completion by default
complete -c wtt -f

# Commands
complete -c wtt -n "__fish_use_subcommand" -a "init" -d "Initialize worktree configuration"
complete -c wtt -n "__fish_use_subcommand" -a "create" -d "Create a new worktree"
complete -c wtt -n "__fish_use_subcommand" -a "switch" -d "Switch to a worktree"
complete -c wtt -n "__fish_use_subcommand" -a "list" -d "List worktrees"
complete -c wtt -n "__fish_use_subcommand" -a "remove" -d "Remove a worktree"
complete -c wtt -n "__fish_use_subcommand" -a "help" -d "Show help"

# Context-aware completions
complete -c wtt -n "__fish_seen_subcommand_from switch remove" -a "(wtt list --format=names 2>/dev/null)"

# Options
complete -c wtt -n "__fish_seen_subcommand_from create" -s b -l branch -d "Branch name"
complete -c wtt -n "__fish_seen_subcommand_from create" -l base -d "Base branch"
```

### PowerShell

**Supports Auto-Completion:** ✅ Yes

**Implementation Method:**
- Uses `Register-ArgumentCompleter` cmdlet
- Completion scripts typically added to PowerShell profile
- Supports sophisticated completion with `CompletionResult` objects
- Can provide tooltips and custom list entries

**Example Implementation:**
```powershell
Register-ArgumentCompleter -CommandName wtt -ScriptBlock {
    param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
    
    $commands = @(
        [System.Management.Automation.CompletionResult]::new('init', 'init', 'ParameterValue', 'Initialize worktree configuration')
        [System.Management.Automation.CompletionResult]::new('create', 'create', 'ParameterValue', 'Create a new worktree')
        [System.Management.Automation.CompletionResult]::new('switch', 'switch', 'ParameterValue', 'Switch to a worktree')
        [System.Management.Automation.CompletionResult]::new('list', 'list', 'ParameterValue', 'List worktrees')
        [System.Management.Automation.CompletionResult]::new('remove', 'remove', 'ParameterValue', 'Remove a worktree')
        [System.Management.Automation.CompletionResult]::new('help', 'help', 'ParameterValue', 'Show help')
    )
    
    # Check if we're completing the first argument (command)
    if ($commandAst.CommandElements.Count -eq 2) {
        $commands | Where-Object { $_.CompletionText -like "$wordToComplete*" }
    }
    # Context-aware completion for switch/remove
    elseif ($commandAst.CommandElements[1].Value -in @('switch', 'remove')) {
        $worktrees = & wtt list --format=names 2>$null
        $worktrees | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', "Worktree: $_")
        }
    }
}
```

## Features to Auto-Complete

Based on common CLI tool patterns and best practices, wtt should provide auto-completion for:

### 1. **Commands (Primary Verbs)**
- `init` - Initialize worktree configuration
- `create` - Create a new worktree
- `switch` - Switch to an existing worktree
- `list` - List all worktrees
- `remove` - Remove a worktree
- `help` - Display help information

### 2. **Options and Flags**
- Global options: `--help`, `--version`, `--verbose`, `--quiet`
- Command-specific options:
  - `create`: `--branch/-b`, `--base`, `--path`, `--no-switch`
  - `list`: `--format`, `--json`, `--paths`
  - `remove`: `--force`, `--dry-run`
  - `switch`: `--tmux`, `--no-tmux`

### 3. **Context-Aware Arguments**
- **Worktree names**: For `switch` and `remove` commands
- **Branch names**: For `create --branch` (from git branches)
- **Directory paths**: For `create --path`
- **Format options**: For `list --format` (e.g., "json", "table", "names")

### 4. **File Paths**
- Configuration files for advanced commands
- `.worktree-config.json` for configuration commands

### 5. **Dynamic Values**
- Existing worktree names (from `wtt list`)
- Git branch names (from `git branch`)
- Git remote branches (from `git branch -r`)

## Implementation Strategy

### 1. **Shell Script Generation**
Create a command `wtt completion <shell>` that generates the appropriate completion script for each shell. This follows the pattern used by kubectl, helm, and other modern CLI tools.

```bash
# Generate completion script
wtt completion bash > ~/.local/share/bash-completion/completions/wtt
wtt completion zsh > ~/.zsh/completions/_wtt
wtt completion fish > ~/.config/fish/completions/wtt.fish
wtt completion powershell | Out-String | Invoke-Expression
```

### 2. **Self-Contained Scripts**
Generate self-contained completion scripts that:
- Don't require the tool to be installed to load
- Cache worktree lists for performance
- Handle errors gracefully (don't break completion if wtt fails)

### 3. **Installation Instructions**
Provide clear documentation for each shell on how to:
- Generate the completion script
- Install it in the correct location
- Source it or reload the shell
- Test that completion is working

### 4. **Auto-Installation Option**
Consider providing a `wtt completion install` command that:
- Detects the current shell
- Generates the appropriate script
- Installs it in the correct location
- Adds sourcing to shell profile if needed

## Performance Considerations

1. **Lazy Loading**: Completions should only execute when needed
2. **Caching**: Cache worktree lists and branch names for faster completion
3. **Timeouts**: Set reasonable timeouts for dynamic completions
4. **Minimal Dependencies**: Completion scripts should work without external dependencies

## Testing Strategy

1. **Unit Tests**: Test completion generation for each shell
2. **Integration Tests**: Test actual completion in each supported shell
3. **Manual Testing**: Document manual test procedures for each shell
4. **CI Testing**: Automate completion testing where possible

## Future Enhancements

1. **Fuzzy Matching**: Support fuzzy matching for worktree names
2. **Alias Support**: Complete custom aliases defined in configuration
3. **Smart Suggestions**: Suggest likely next commands based on context
4. **Multi-Level Completion**: Support sub-subcommands if added
5. **Plugin System**: Allow users to extend completions

## Conclusion

Implementing comprehensive auto-completion for wtt will significantly improve the user experience. By supporting all major shells and following established patterns from popular CLI tools, we can ensure that auto-completion "just works" for most users with minimal setup required.