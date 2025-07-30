import { executeCreate } from '../../../src/commands/create';
import * as git from '../../../src/core/git';
import * as config from '../../../src/core/config';
import * as logger from '../../../src/utils/logger';

// Mock all dependencies
jest.mock('../../../src/core/git');
jest.mock('../../../src/core/config');
jest.mock('../../../src/utils/logger');

describe('Create Command - No Commits', () => {
  let mockLogger: any;
  let mockGit: any;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock logger
    mockLogger = {
      verbose: jest.fn(),
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      getLevel: jest.fn().mockReturnValue('normal')
    };
    (logger.getLogger as jest.Mock).mockReturnValue(mockLogger);
    
    // Mock config
    (config.loadConfig as jest.Mock).mockResolvedValue({
      version: '1.0.0',
      projectName: 'test-project',
      mainBranch: 'main',
      baseDir: '.worktrees',
      tmux: false
    });
    
    // Mock git
    mockGit = {
      isGitRepository: jest.fn().mockResolvedValue(true),
      hasCommits: jest.fn().mockResolvedValue(false),
      createWorktree: jest.fn()
    };
    (git.createGit as jest.Mock).mockReturnValue(mockGit);
    
    // Mock process.exit
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it('should fail with friendly error when no commits exist', async () => {
    await expect(executeCreate({ name: 'feature' })).rejects.toThrow('process.exit');
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Cannot create worktree: No commits found. Please make at least one commit before creating worktrees.'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should check for commits before attempting to create worktree', async () => {
    await expect(executeCreate({ name: 'feature' })).rejects.toThrow('process.exit');
    
    // Verify it checked for commits
    expect(mockGit.hasCommits).toHaveBeenCalled();
    
    // Verify it didn't try to create worktree
    expect(mockGit.createWorktree).not.toHaveBeenCalled();
  });

  it('should handle git error with HEAD message gracefully', async () => {
    // Mock hasCommits to return true but createWorktree fails with HEAD error
    mockGit.hasCommits.mockResolvedValue(true);
    mockGit.createWorktree.mockRejectedValue(
      new Error("fatal: Not a valid object name: 'HEAD'.")
    );
    
    await expect(executeCreate({ name: 'feature' })).rejects.toThrow('process.exit');
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Cannot create worktree: No commits found. Please make at least one commit before creating worktrees.'
    );
  });
});