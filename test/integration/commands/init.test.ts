import { promises as fs } from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { 
  withCleanEnvironment,
  ensureNotInWorktree 
} from '../../helpers/isolation';
import { 
  createTestRepo,
  createTestRepoWithCommit,
  createTestRepoWithBranches
} from '../../helpers/git';
import { simpleGit } from 'simple-git';

// Path to the compiled wtt binary
const WTT_BIN = path.resolve(__dirname, '../../../dist/index.js');

describe('Init Command Integration Tests', () => {
  // Ensure tests are not running in a worktree
  beforeAll(async () => {
    await ensureNotInWorktree();
  });

  describe('Basic Initialization', () => {
    it('should fail in non-git directory', async () => {
      await withCleanEnvironment(async () => {
        // Try to run init in a non-git directory
        expect(() => {
          execSync(`node "${WTT_BIN}" init`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        }).toThrow();
        
        // Verify error message
        try {
          execSync(`node "${WTT_BIN}" init`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        } catch (error: any) {
          expect(error.stderr).toContain('Not in a git repository');
        }
      });
    });

    it('should succeed in git directory without commits', async () => {
      await withCleanEnvironment(async () => {
        // Create empty git repo
        await createTestRepo(process.cwd());
        
        // Git init automatically sets up HEAD to point to the default branch
        // No need to set it manually
        
        // Run init - should succeed
        const output = execSync(`node "${WTT_BIN}" init`, { 
          encoding: 'utf-8'
        });
        
        // Verify concise success message
        expect(output).toContain('Initialized worktree project. Config: .worktree-config.json');
        
        // Verify config was created with detected branch
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        // Should be either 'master' or 'main' depending on git config
        expect(['master', 'main']).toContain(config.mainBranch);
      });
    });

    it('should detect master branch in empty repo', async () => {
      await withCleanEnvironment(async () => {
        const git = simpleGit(process.cwd());
        await git.init();
        
        // Force HEAD to point to master
        await git.raw(['symbolic-ref', 'HEAD', 'refs/heads/master']);
        
        // Run init
        execSync(`node "${WTT_BIN}" init`, { encoding: 'utf-8' });
        
        // Verify detected branch
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.mainBranch).toBe('master');
      });
    });

    it('should detect main branch in empty repo', async () => {
      await withCleanEnvironment(async () => {
        const git = simpleGit(process.cwd());
        await git.init();
        
        // Force HEAD to point to main
        await git.raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);
        
        // Run init
        execSync(`node "${WTT_BIN}" init`, { encoding: 'utf-8' });
        
        // Verify detected branch
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.mainBranch).toBe('main');
      });
    });

    it('should succeed in git directory with commits', async () => {
      await withCleanEnvironment(async () => {
        // Create git repo with commit
        await createTestRepoWithCommit(process.cwd());
        
        // Run init
        const output = execSync(`node "${WTT_BIN}" init`, { 
          encoding: 'utf-8' 
        });
        
        // Verify concise success message
        expect(output).toContain('Initialized worktree project. Config: .worktree-config.json');
        
        // Verify config file exists
        const configPath = path.join(process.cwd(), '.worktree-config.json');
        const configExists = await fs.access(configPath).then(() => true).catch(() => false);
        expect(configExists).toBe(true);
        
        // Verify config content
        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        expect(config.version).toBe('1.0.0');
        expect(config.baseDir).toBe('.worktrees');
        expect(config.projectName).toBeTruthy();
        expect(config.mainBranch).toBeTruthy();
        
        // Verify .gitignore
        const gitignorePath = path.join(process.cwd(), '.gitignore');
        const gitignore = await fs.readFile(gitignorePath, 'utf-8');
        expect(gitignore).toContain('.worktrees/');
      });
    });

    it('should detect main branch correctly', async () => {
      await withCleanEnvironment(async () => {
        // Create repo with 'main' branch
        const git = await createTestRepoWithCommit(process.cwd());
        await git.branch(['-M', 'main']);
        
        // Run init
        execSync(`node "${WTT_BIN}" init`, { encoding: 'utf-8' });
        
        // Verify detected main branch
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.mainBranch).toBe('main');
      });
    });

    it('should detect master branch correctly', async () => {
      await withCleanEnvironment(async () => {
        // Create repo with 'master' branch
        const git = await createTestRepoWithCommit(process.cwd());
        await git.branch(['-M', 'master']);
        
        // Run init
        execSync(`node "${WTT_BIN}" init`, { encoding: 'utf-8' });
        
        // Verify detected master branch
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.mainBranch).toBe('master');
      });
    });
  });

  describe('Custom Options', () => {
    it('should accept custom project name', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // Run init with custom project name
        execSync(`node "${WTT_BIN}" init --project-name "my-custom-project"`, { 
          encoding: 'utf-8' 
        });
        
        // Verify custom project name
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.projectName).toBe('my-custom-project');
      });
    });

    it('should accept custom base directory', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // Run init with custom base dir
        execSync(`node "${WTT_BIN}" init --base-dir ".wt"`, { 
          encoding: 'utf-8' 
        });
        
        // Verify custom base dir
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.baseDir).toBe('.wt');
        
        // Verify gitignore updated with custom dir
        const gitignore = await fs.readFile('.gitignore', 'utf-8');
        expect(gitignore).toContain('.wt/');
      });
    });

    it('should accept custom main branch', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithBranches(process.cwd(), ['develop', 'feature']);
        
        // Run init with custom main branch
        execSync(`node "${WTT_BIN}" init --main-branch develop`, { 
          encoding: 'utf-8' 
        });
        
        // Verify custom main branch
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.mainBranch).toBe('develop');
      });
    });

    it('should handle tmux options', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // Test --enable-tmux
        execSync(`node "${WTT_BIN}" init --enable-tmux`, { 
          encoding: 'utf-8' 
        });
        
        let config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.tmux).toBe(true);
        
        // Clean up for next test
        await fs.unlink('.worktree-config.json');
        
        // Test --disable-tmux
        execSync(`node "${WTT_BIN}" init --disable-tmux`, { 
          encoding: 'utf-8' 
        });
        
        config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.tmux).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should fail when already initialized', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // First init should succeed
        execSync(`node "${WTT_BIN}" init`, { encoding: 'utf-8' });
        
        // Second init should fail
        expect(() => {
          execSync(`node "${WTT_BIN}" init`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        }).toThrow();
        
        // Verify error message
        try {
          execSync(`node "${WTT_BIN}" init`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        } catch (error: any) {
          expect(error.stderr).toContain('already initialized');
        }
      });
    });

    it('should reject conflicting tmux options', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // Try with conflicting options
        expect(() => {
          execSync(`node "${WTT_BIN}" init --enable-tmux --disable-tmux`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        }).toThrow();
        
        // Verify error message
        try {
          execSync(`node "${WTT_BIN}" init --enable-tmux --disable-tmux`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        } catch (error: any) {
          expect(error.stderr).toContain('Cannot specify both');
        }
      });
    });

    it('should reject empty option values', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // Test empty project name
        expect(() => {
          execSync(`node "${WTT_BIN}" init --project-name ""`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        }).toThrow();
        
        // Test empty base dir
        expect(() => {
          execSync(`node "${WTT_BIN}" init --base-dir ""`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        }).toThrow();
        
        // Test empty main branch
        expect(() => {
          execSync(`node "${WTT_BIN}" init --main-branch ""`, { 
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        }).toThrow();
      });
    });
  });

  describe('Self-Hosting Support', () => {
    it('should not interfere with parent wtt repository', async () => {
      await withCleanEnvironment(async () => {
        // Create parent repo with wtt config
        await createTestRepoWithCommit(process.cwd());
        execSync(`node "${WTT_BIN}" init --project-name parent-project`, { 
          encoding: 'utf-8' 
        });
        
        // Create nested repo
        const nestedDir = path.join(process.cwd(), 'nested-project');
        await fs.mkdir(nestedDir, { recursive: true });
        process.chdir(nestedDir);
        
        const nestedGit = simpleGit(nestedDir);
        await nestedGit.init();
        await nestedGit.addConfig('user.email', 'test@example.com');
        await nestedGit.addConfig('user.name', 'Test User');
        
        const readmePath = path.join(nestedDir, 'README.md');
        await fs.writeFile(readmePath, '# Nested Project\n');
        await nestedGit.add('README.md');
        await nestedGit.commit('Initial commit');
        
        // Init nested repo
        execSync(`node "${WTT_BIN}" init --project-name nested-project`, { 
          encoding: 'utf-8' 
        });
        
        // Verify both configs exist and are different
        const parentConfigPath = path.join(path.dirname(nestedDir), '.worktree-config.json');
        const nestedConfigPath = path.join(nestedDir, '.worktree-config.json');
        
        const parentConfig = JSON.parse(await fs.readFile(parentConfigPath, 'utf-8'));
        const nestedConfig = JSON.parse(await fs.readFile(nestedConfigPath, 'utf-8'));
        
        expect(parentConfig.projectName).toBe('parent-project');
        expect(nestedConfig.projectName).toBe('nested-project');
        
        // Verify nested repo has its own gitignore
        const nestedGitignore = await fs.readFile(
          path.join(nestedDir, '.gitignore'), 
          'utf-8'
        );
        expect(nestedGitignore).toContain('.worktrees/');
      });
    });

    it('should work when wtt is managing its own repository', async () => {
      await withCleanEnvironment(async () => {
        // Simulate wtt repository
        await createTestRepoWithCommit(process.cwd());
        
        // Create package.json to make it look like wtt
        const packageJson = {
          name: 'worktree-tool',
          version: '1.0.0',
          bin: {
            wtt: './dist/index.js'
          }
        };
        await fs.writeFile(
          'package.json', 
          JSON.stringify(packageJson, null, 2)
        );
        
        // Add and commit package.json
        const git = simpleGit(process.cwd());
        await git.add('package.json');
        await git.commit('Add package.json');
        
        // Init should work fine
        const output = execSync(`node "${WTT_BIN}" init`, { 
          encoding: 'utf-8' 
        });
        
        expect(output).toContain('Initialized worktree project. Config: .worktree-config.json');
        
        // Verify config
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.projectName).toBe('worktree-tool');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle repositories with many branches', async () => {
      await withCleanEnvironment(async () => {
        // Create repo with multiple branches
        const branches = ['develop', 'feature/a', 'feature/b', 'hotfix/1'];
        await createTestRepoWithBranches(process.cwd(), branches);
        
        // Init should work
        const output = execSync(`node "${WTT_BIN}" init`, { 
          encoding: 'utf-8' 
        });
        
        expect(output).toContain('Initialized worktree project. Config: .worktree-config.json');
      });
    });

    it('should handle special characters in project names', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // Create directory with special name
        const specialName = 'my-project@2.0';
        
        // Run init with special characters
        execSync(`node "${WTT_BIN}" init --project-name "${specialName}"`, { 
          encoding: 'utf-8' 
        });
        
        // Verify project name is preserved
        const config = JSON.parse(
          await fs.readFile('.worktree-config.json', 'utf-8')
        );
        expect(config.projectName).toBe(specialName);
      });
    });

    it('should update existing .gitignore', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // Create existing .gitignore
        const existingContent = 'node_modules/\n*.log\n';
        await fs.writeFile('.gitignore', existingContent);
        
        // Run init
        execSync(`node "${WTT_BIN}" init`, { encoding: 'utf-8' });
        
        // Verify .gitignore preserved existing content
        const gitignore = await fs.readFile('.gitignore', 'utf-8');
        expect(gitignore).toContain('node_modules/');
        expect(gitignore).toContain('*.log');
        expect(gitignore).toContain('.worktrees/');
      });
    });

    it('should show detailed output in verbose mode', async () => {
      await withCleanEnvironment(async () => {
        await createTestRepoWithCommit(process.cwd());
        
        // Run init with verbose flag
        const output = execSync(`node "${WTT_BIN}" init --verbose`, { 
          encoding: 'utf-8' 
        });
        
        // Verify verbose output includes detailed information
        expect(output).toContain('Created .worktree-config.json');
        expect(output).toContain('Updated .gitignore');
        expect(output).toContain('Repository initialized with:');
        expect(output).toContain('Project name:');
        expect(output).toContain('Main branch:');
        expect(output).toContain('Worktree dir:');
        expect(output).toContain('Tmux support:');
        
        // Should still include concise message
        expect(output).toContain('Initialized worktree project. Config: .worktree-config.json');
      });
    });
  });
});