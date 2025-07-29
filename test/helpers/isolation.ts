import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Ensure tests run in an isolated environment
 * This is critical for self-hosting - tests must not use production config
 */
export async function ensureTestIsolation(): Promise<{ cleanup: () => Promise<void> }> {
  // Save current working directory
  const originalCwd = process.cwd();
  
  // Create temporary directory for test
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtt-test-'));
  
  // Change to temp directory
  process.chdir(tempDir);
  
  return {
    cleanup: async () => {
      // Restore original directory
      process.chdir(originalCwd);
      
      // Remove temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Failed to cleanup test directory ${tempDir}:`, error);
      }
    }
  };
}

/**
 * Run a test in a clean environment
 */
export async function withCleanEnvironment<T>(
  fn: () => Promise<T>
): Promise<T> {
  const isolation = await ensureTestIsolation();
  try {
    return await fn();
  } finally {
    await isolation.cleanup();
  }
}

/**
 * Verify test is not running in a wtt worktree
 */
export async function ensureNotInWorktree(): Promise<void> {
  const cwd = process.cwd();
  
  // Check if we're in a .worktrees directory
  if (cwd.includes('.worktrees')) {
    throw new Error('Tests should not run inside a wtt worktree');
  }
  
  // Check if parent has .worktree-config.json (but not current dir)
  let currentDir = cwd;
  while (currentDir !== path.dirname(currentDir)) {
    const parentDir = path.dirname(currentDir);
    
    try {
      const configPath = path.join(parentDir, '.worktree-config.json');
      await fs.access(configPath);
      
      // If we found a config in parent, make sure we're not in its worktree dir
      const parentConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const worktreePath = path.join(parentDir, parentConfig.baseDir || '.worktrees');
      
      if (cwd.startsWith(worktreePath)) {
        throw new Error('Tests should not run inside a wtt worktree');
      }
    } catch {
      // Config doesn't exist or can't be read, continue
    }
    
    currentDir = parentDir;
  }
}