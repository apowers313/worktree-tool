import { executeHelp, helpCommand } from '../../../src/commands/help';
import * as logger from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger');

describe('Help Command', () => {
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      verbose: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      getLevel: jest.fn().mockReturnValue('normal')
    };
    (logger.getLogger as jest.Mock).mockReturnValue(mockLogger);
  });

  describe('executeHelp', () => {
    it('should display general help information', async () => {
      await executeHelp();
      
      // Check that help information is displayed
      expect(mockLogger.info).toHaveBeenCalledWith('wtt - Git Worktree Management Tool\n');
      expect(mockLogger.info).toHaveBeenCalledWith('USAGE:');
      expect(mockLogger.info).toHaveBeenCalledWith('COMMANDS:');
      expect(mockLogger.info).toHaveBeenCalledWith('EXAMPLES:');
      expect(mockLogger.info).toHaveBeenCalledWith('OPTIONS:');
    });

    it('should show available commands', async () => {
      await executeHelp();
      
      expect(mockLogger.info).toHaveBeenCalledWith('  init              Initialize worktree management in current repository');
      expect(mockLogger.info).toHaveBeenCalledWith('  create            Create a new worktree for a feature branch');
      expect(mockLogger.info).toHaveBeenCalledWith('  help              Show this help message\n');
    });

    it('should show usage examples', async () => {
      await executeHelp();
      
      expect(mockLogger.info).toHaveBeenCalledWith('  wtt init                           # Initialize with defaults');
      expect(mockLogger.info).toHaveBeenCalledWith('  wtt create feature-login           # Create worktree for feature-login branch');
      expect(mockLogger.info).toHaveBeenCalledWith('  wtt create "Add New Button"        # Create worktree with spaces in name\n');
    });

    it('should show available options', async () => {
      await executeHelp();
      
      expect(mockLogger.info).toHaveBeenCalledWith('  --verbose         Show detailed output');
      expect(mockLogger.info).toHaveBeenCalledWith('  --help           Show help for specific command\n');
    });

    it('should show command-specific help instruction', async () => {
      await executeHelp();
      
      expect(mockLogger.info).toHaveBeenCalledWith('For command-specific help, use: wtt <command> --help');
    });
  });

  describe('Help Command Definition', () => {
    it('should have correct command name', () => {
      expect(helpCommand.name()).toBe('help');
    });

    it('should have description', () => {
      expect(helpCommand.description()).toContain('Display help information');
    });

    it('should not have any required options', () => {
      const options = helpCommand.options;
      const requiredOptions = options.filter(opt => opt.required);
      
      expect(requiredOptions).toHaveLength(0);
    });
  });
});