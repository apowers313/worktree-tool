import chalk from 'chalk';
import { LogLevel, GlobalOptions } from '../core/types';

export class Logger {
  private level: LogLevel;

  constructor(options?: GlobalOptions) {
    if (options?.quiet) {
      this.level = 'quiet';
    } else if (options?.verbose) {
      this.level = 'verbose';
    } else {
      this.level = 'normal';
    }
  }

  /**
   * Log an error message (always shown)
   */
  error(message: string): void {
    console.error(chalk.red(`✗ ${message}`));
  }

  /**
   * Log a success message (shown in normal and verbose modes)
   */
  success(message: string): void {
    if (this.level !== 'quiet') {
      console.log(chalk.green(`✓ ${message}`));
    }
  }

  /**
   * Log an info message (shown in normal and verbose modes)
   */
  info(message: string): void {
    if (this.level !== 'quiet') {
      console.log(chalk.blue(`ℹ ${message}`));
    }
  }

  /**
   * Log a warning message (shown in normal and verbose modes)
   */
  warn(message: string): void {
    if (this.level !== 'quiet') {
      console.warn(chalk.yellow(`⚠ ${message}`));
    }
  }

  /**
   * Log a verbose message (only shown in verbose mode)
   */
  verbose(message: string): void {
    if (this.level === 'verbose') {
      console.log(chalk.gray(`• ${message}`));
    }
  }

  /**
   * Log a plain message (shown in normal and verbose modes)
   */
  log(message: string): void {
    if (this.level !== 'quiet') {
      console.log(message);
    }
  }

  /**
   * Start a progress indicator (shown in normal and verbose modes)
   * @returns A function to stop the progress indicator
   */
  progress(message: string): () => void {
    if (this.level === 'quiet') {
      return () => {};
    }

    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    
    const interval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(frames[i])} ${message}`);
      i = (i + 1) % frames.length;
    }, 80);

    return () => {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(message.length + 3) + '\r');
    };
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

// Singleton instance
let instance: Logger;

/**
 * Get or create the logger instance
 */
export function getLogger(options?: GlobalOptions): Logger {
  if (!instance || options) {
    instance = new Logger(options);
  }
  return instance;
}