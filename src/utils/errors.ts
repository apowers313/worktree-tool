/**
 * Custom error classes for wtt
 */

/**
 * Base error class for all wtt errors
 */
export class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'WorktreeError';
    
    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorktreeError);
    }
  }
}

/**
 * Error thrown when git operations fail
 */
export class GitError extends WorktreeError {
  constructor(message: string, details?: unknown) {
    super(message, 'GIT_ERROR', details);
    this.name = 'GitError';
  }
}

/**
 * Error thrown when tmux operations fail
 */
export class TmuxError extends WorktreeError {
  constructor(message: string, details?: unknown) {
    super(message, 'TMUX_ERROR', details);
    this.name = 'TmuxError';
  }
}

/**
 * Error thrown when configuration is invalid or missing
 */
export class ConfigError extends WorktreeError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigError';
  }
}

/**
 * Error thrown when file system operations fail
 */
export class FileSystemError extends WorktreeError {
  constructor(message: string, details?: unknown) {
    super(message, 'FS_ERROR', details);
    this.name = 'FileSystemError';
  }
}

/**
 * Error thrown when command validation fails
 */
export class ValidationError extends WorktreeError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when platform operations fail
 */
export class PlatformError extends WorktreeError {
  constructor(message: string, details?: unknown) {
    super(message, 'PLATFORM_ERROR', details);
    this.name = 'PlatformError';
  }
}

/**
 * Helper to determine if an error is a WorktreeError
 */
export function isWorktreeError(error: unknown): error is WorktreeError {
  return error instanceof WorktreeError;
}

/**
 * Helper to format error messages for user display
 */
export function formatErrorMessage(error: unknown): string {
  if (isWorktreeError(error)) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}