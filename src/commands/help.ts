import { Command } from 'commander';
import { getLogger } from '../utils/logger';

/**
 * Execute the help command
 */
export async function executeHelp(): Promise<void> {
  const logger = getLogger();
  
  logger.info('wtt - Git Worktree Management Tool\n');
  
  logger.info('USAGE:');
  logger.info('  wtt <command> [options]\n');
  
  logger.info('COMMANDS:');
  logger.info('  init              Initialize worktree management in current repository');
  logger.info('  create            Create a new worktree for a feature branch');
  logger.info('  help              Show this help message\n');
  
  logger.info('EXAMPLES:');
  logger.info('  wtt init                           # Initialize with defaults');
  logger.info('  wtt init --enable-tmux             # Initialize with tmux integration');
  logger.info('  wtt init --project-name "My App"   # Initialize with custom project name');
  logger.info('  wtt create feature-login           # Create worktree for feature-login branch');
  logger.info('  wtt create "Add New Button"        # Create worktree with spaces in name\n');
  
  logger.info('OPTIONS:');
  logger.info('  --verbose         Show detailed output');
  logger.info('  --help           Show help for specific command\n');
  
  logger.info('For command-specific help, use: wtt <command> --help');
}

/**
 * Create the help command
 */
export const helpCommand = new Command('help')
  .description('Display help information')
  .action(() => executeHelp());