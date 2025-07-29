import { Git, createGit } from '../../../src/core/git';
import { GitError } from '../../../src/utils/errors';
import simpleGit from 'simple-git';

// Mock simple-git
jest.mock('simple-git');

describe('Git Wrapper', () => {
  let mockGit: any;
  let git: Git;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock git instance
    mockGit = {
      checkIsRepo: jest.fn(),
      status: jest.fn(),
      branch: jest.fn(),
      raw: jest.fn(),
      revparse: jest.fn(),
    };
    
    // Make simpleGit return our mock
    (simpleGit as any).mockReturnValue(mockGit);
    
    git = new Git();
  });

  describe('isGitRepository', () => {
    it('should return true when in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);
      
      const result = await git.isGitRepository();
      
      expect(result).toBe(true);
      expect(mockGit.checkIsRepo).toHaveBeenCalledTimes(1);
    });

    it('should return false when not in a git repository', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false);
      
      const result = await git.isGitRepository();
      
      expect(result).toBe(false);
    });

    it('should return false when checkIsRepo throws an error', async () => {
      mockGit.checkIsRepo.mockRejectedValue(new Error('Not a git repository'));
      
      const result = await git.isGitRepository();
      
      expect(result).toBe(false);
    });
  });

  describe('getMainBranch', () => {
    it('should detect "main" branch when it exists', async () => {
      mockGit.status.mockResolvedValue({ current: 'feature' });
      mockGit.branch.mockResolvedValue({
        all: ['main', 'feature', 'develop'],
        current: 'feature'
      });
      
      const result = await git.getMainBranch();
      
      expect(result).toBe('main');
    });

    it('should detect "master" branch when "main" does not exist', async () => {
      mockGit.status.mockResolvedValue({ current: 'feature' });
      mockGit.branch.mockResolvedValue({
        all: ['master', 'feature', 'develop'],
        current: 'feature'
      });
      
      const result = await git.getMainBranch();
      
      expect(result).toBe('master');
    });

    it('should detect "trunk" branch', async () => {
      mockGit.status.mockResolvedValue({ current: 'feature' });
      mockGit.branch.mockResolvedValue({
        all: ['trunk', 'feature'],
        current: 'feature'
      });
      
      const result = await git.getMainBranch();
      
      expect(result).toBe('trunk');
    });

    it('should detect "development" branch', async () => {
      mockGit.status.mockResolvedValue({ current: 'feature' });
      mockGit.branch.mockResolvedValue({
        all: ['development', 'feature'],
        current: 'feature'
      });
      
      const result = await git.getMainBranch();
      
      expect(result).toBe('development');
    });

    it('should use git config init.defaultBranch when no common branch found', async () => {
      mockGit.status.mockResolvedValue({ current: 'feature' });
      mockGit.branch.mockResolvedValue({
        all: ['feature', 'custom'],
        current: 'feature'
      });
      mockGit.raw.mockResolvedValue('custom-main\n');
      
      const result = await git.getMainBranch();
      
      expect(result).toBe('custom-main');
      expect(mockGit.raw).toHaveBeenCalledWith(['config', '--get', 'init.defaultBranch']);
    });

    it('should default to "main" when no branches and no config', async () => {
      mockGit.status.mockResolvedValue({ current: null });
      mockGit.branch.mockResolvedValue({
        all: [],
        current: null
      });
      mockGit.raw.mockRejectedValue(new Error('Config not found'));
      
      const result = await git.getMainBranch();
      
      expect(result).toBe('main');
    });

    it('should throw GitError when status fails', async () => {
      mockGit.status.mockRejectedValue(new Error('Git error'));
      
      await expect(git.getMainBranch()).rejects.toThrow(GitError);
      await expect(git.getMainBranch()).rejects.toThrow('Failed to detect main branch');
    });
  });

  describe('createWorktree', () => {
    it('should create worktree with existing branch', async () => {
      mockGit.branch.mockResolvedValue({
        all: ['main', 'feature-branch'],
        current: 'main'
      });
      mockGit.raw.mockResolvedValue('');
      
      await git.createWorktree('/path/to/worktree', 'feature-branch');
      
      expect(mockGit.raw).toHaveBeenCalledWith(['worktree', 'add', '/path/to/worktree', 'feature-branch']);
    });

    it('should create worktree with new branch', async () => {
      mockGit.branch.mockResolvedValue({
        all: ['main'],
        current: 'main'
      });
      mockGit.raw.mockResolvedValue('');
      
      await git.createWorktree('/path/to/worktree', 'new-feature');
      
      expect(mockGit.raw).toHaveBeenCalledWith(['worktree', 'add', '-b', 'new-feature', '/path/to/worktree']);
    });

    it('should throw GitError when worktree creation fails', async () => {
      mockGit.branch.mockResolvedValue({
        all: ['main'],
        current: 'main'
      });
      mockGit.raw.mockRejectedValue(new Error('Worktree already exists'));
      
      await expect(git.createWorktree('/path/to/worktree', 'feature'))
        .rejects.toThrow(GitError);
      await expect(git.createWorktree('/path/to/worktree', 'feature'))
        .rejects.toThrow('Failed to create worktree');
    });
  });

  describe('listWorktrees', () => {
    it('should parse worktree list correctly', async () => {
      const porcelainOutput = `worktree /home/user/project
HEAD abc123def456
branch refs/heads/main

worktree /home/user/project/.worktrees/feature
HEAD 789012ghi345
branch refs/heads/feature

worktree /home/user/project/.worktrees/locked-feature
HEAD 456789jkl012
branch refs/heads/locked-feature
locked
`;
      
      mockGit.raw.mockResolvedValue(porcelainOutput);
      
      const result = await git.listWorktrees();
      
      expect(result).toHaveLength(3);
      
      expect(result[0]).toEqual({
        path: '/home/user/project',
        commit: 'abc123def456',
        branch: 'refs/heads/main',
        isMain: true,
        isLocked: false
      });
      
      expect(result[1]).toEqual({
        path: '/home/user/project/.worktrees/feature',
        commit: '789012ghi345',
        branch: 'refs/heads/feature',
        isMain: false,
        isLocked: false
      });
      
      expect(result[2]).toEqual({
        path: '/home/user/project/.worktrees/locked-feature',
        commit: '456789jkl012',
        branch: 'refs/heads/locked-feature',
        isMain: false,
        isLocked: true
      });
    });

    it('should return empty array when no worktrees', async () => {
      mockGit.raw.mockResolvedValue('');
      
      const result = await git.listWorktrees();
      
      expect(result).toEqual([]);
    });

    it('should handle bare repository', async () => {
      const porcelainOutput = `worktree /home/user/repo.git
bare
`;
      
      mockGit.raw.mockResolvedValue(porcelainOutput);
      
      const result = await git.listWorktrees();
      
      expect(result).toHaveLength(1);
      expect(result[0]?.isMain).toBe(true);
    });

    it('should throw GitError when listing fails', async () => {
      mockGit.raw.mockRejectedValue(new Error('Git command failed'));
      
      await expect(git.listWorktrees()).rejects.toThrow(GitError);
      await expect(git.listWorktrees()).rejects.toThrow('Failed to list worktrees');
    });
  });

  describe('getRepoRoot', () => {
    it('should return repository root path', async () => {
      mockGit.revparse.mockResolvedValue('/home/user/project\n');
      
      const result = await git.getRepoRoot();
      
      expect(result).toBe('/home/user/project');
      expect(mockGit.revparse).toHaveBeenCalledWith(['--show-toplevel']);
    });

    it('should throw GitError when not in a repository', async () => {
      mockGit.revparse.mockRejectedValue(new Error('Not in a git repository'));
      
      await expect(git.getRepoRoot()).rejects.toThrow(GitError);
      await expect(git.getRepoRoot()).rejects.toThrow('Failed to get repository root');
    });
  });

  describe('branchExists', () => {
    it('should return true when branch exists', async () => {
      mockGit.branch.mockResolvedValue({
        all: ['main', 'feature', 'develop'],
        current: 'main'
      });
      
      const result = await git.branchExists('feature');
      
      expect(result).toBe(true);
    });

    it('should return false when branch does not exist', async () => {
      mockGit.branch.mockResolvedValue({
        all: ['main', 'develop'],
        current: 'main'
      });
      
      const result = await git.branchExists('feature');
      
      expect(result).toBe(false);
    });

    it('should throw GitError when branch check fails', async () => {
      mockGit.branch.mockRejectedValue(new Error('Git error'));
      
      await expect(git.branchExists('feature')).rejects.toThrow(GitError);
      await expect(git.branchExists('feature')).rejects.toThrow('Failed to check branch existence');
    });
  });

  describe('createGit', () => {
    it('should create Git instance with default directory', () => {
      const gitInstance = createGit();
      
      expect(gitInstance).toBeInstanceOf(Git);
      expect(simpleGit).toHaveBeenCalledWith(undefined);
    });

    it('should create Git instance with specified directory', () => {
      const gitInstance = createGit('/custom/path');
      
      expect(gitInstance).toBeInstanceOf(Git);
      expect(simpleGit).toHaveBeenCalledWith('/custom/path');
    });
  });
});