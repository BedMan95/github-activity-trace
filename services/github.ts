/**
 * GitHub API Client Wrapper
 * 
 * Provides a wrapper around @octokit/rest with:
 * - Automatic Octokit initialization with user agent and token
 * - Request retry logic with exponential backoff
 * - Rate limit header parsing and tracking
 * 
 * @file services/github.ts
 */

import { Octokit } from '@octokit/rest';
import type { RateLimitInfo } from '../types/github';

// ============================================
// Constants
// ============================================

/**
 * Application name for User-Agent header
 */
const APPLICATION_NAME = 'github-activity-trace';

/**
 * Version for User-Agent header
 */
const APPLICATION_VERSION = '1.0.0';

/**
 * Base delay for exponential backoff (milliseconds)
 */
export const BASE_RETRY_DELAY = 1000;

/**
 * Maximum retry attempts for transient failures
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Maximum concurrent requests to GitHub API
 */
export const MAX_CONCURRENT_REQUESTS = 5;

/**
 * Coefficient for rate limit warning (when remaining < limit * coefficient)
 */
export const RATE_LIMIT_WARNING_THRESHOLD = 0.002; // 0.2% remaining

// ============================================
// Rate Limit Tracking
// ============================================

/**
 * Global rate limit state shared across all GitHubService instances
 */
export let globalRateLimitInfo: RateLimitInfo = {
  remaining: 5000,
  resetTime: Math.floor(Date.now() / 1000) + 3600,
  limit: 5000,
};

/**
 * Gets the current global rate limit info
 */
export function getGlobalRateLimitInfo(): RateLimitInfo {
  return { ...globalRateLimitInfo };
}

/**
 * Updates the global rate limit info from response headers
 */
export function updateRateLimitFromHeaders(headers: {
  'x-ratelimit-limit'?: string;
  'x-ratelimit-remaining'?: string;
  'x-ratelimit-reset'?: string;
}): void {
  const limit = parseInt(headers['x-ratelimit-limit'] || '5000', 10);
  const remaining = parseInt(headers['x-ratelimit-remaining'] || String(limit), 10);
  const resetTime = parseInt(headers['x-ratelimit-reset'] || String(Math.floor(Date.now() / 1000) + 3600), 10);

  globalRateLimitInfo = {
    limit,
    remaining,
    resetTime,
  };
}

/**
 * Checks if rate limit is approaching (warning threshold)
 */
export function isRateLimitWarning(): boolean {
  const { remaining, limit } = globalRateLimitInfo;
  return remaining < Math.max(10, limit * RATE_LIMIT_WARNING_THRESHOLD);
}

/**
 * Checks if rate limit is exhausted
 */
export function isRateLimitExceeded(): boolean {
  const { remaining, resetTime } = globalRateLimitInfo;
  return remaining <= 0 && resetTime > Date.now() / 1000;
}

/**
 * Gets time until rate limit resets (in seconds)
 */
export function getRateLimitResetSeconds(): number {
  const { resetTime } = globalRateLimitInfo;
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, resetTime - now);
}

// ============================================
// Exponential Backoff
// ============================================

/**
 * Calculates delay for exponential backoff
 * 
 * @param attempt - Current attempt number (0-based)
 * @param baseDelay - Base delay in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number = BASE_RETRY_DELAY): number {
  // Exponential backoff: base * 2^attempt with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // Add random jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(exponentialDelay + jitter);
}

/**
 * Sleeps for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// GitHub Service Class
// ============================================

/**
 * GitHubService class for API interactions
 * 
 * Provides methods for GitHub API calls with:
 * - Automatic retry with exponential backoff
 * - Rate limit tracking
 * - Request concurrency limiting
 */
class GitHubService {
  private octokit: Octokit;
  private traceId: string;
  private token: string; // Store token for withFreshTraceId

  /**
   * Creates a new GitHubService instance
   * 
   * @param token - GitHub Personal Access Token
   * @param traceId - Optional trace ID for request correlation
   */
  constructor(token: string, traceId?: string) {
    this.token = token;
    this.traceId = traceId || this.generateTraceId();
    
    this.octokit = new Octokit({
      auth: token,
      userAgent: `${APPLICATION_NAME}/${APPLICATION_VERSION}`,
      timeouts: {
        request: 30000, // 30 second timeout
      },
    });
  }

  /**
   * Generates a unique trace ID for request correlation
   */
  private generateTraceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Gets the Octokit instance
   */
  getOctokit(): Octokit {
    return this.octokit;
  }

  /**
   * Gets the trace ID for this service instance
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Creates a new instance with the same configuration but a new trace ID
   */
  withFreshTraceId(): GitHubService {
    return new GitHubService(this.token, this.generateTraceId());
  }

  // ========================================
  // Rate Limit Methods
  // ========================================

  /**
   * Gets current rate limit info
   */
  getRateLimitInfo(): RateLimitInfo {
    return { ...globalRateLimitInfo };
  }

  /**
   * Checks if rate limit is warning
   */
  shouldWarnRateLimit(): boolean {
    return isRateLimitWarning();
  }

  /**
   * Checks if rate limit is exceeded
   */
  isRateLimitExceeded(): boolean {
    return isRateLimitExceeded();
  }

  // ========================================
  // Retry Logic
  // ========================================

  /**
   * Executes a request with retry logic and exponential backoff
   * 
   * @param requestFn - Function that makes the API request
   * @param maxRetries - Maximum retry attempts (default: MAX_RETRY_ATTEMPTS)
   * @returns Result of the request function
   */
  async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = MAX_RETRY_ATTEMPTS
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await requestFn();
        return result;
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable (5xx errors or rate limit)
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === maxRetries) {
          // Non-retryable error or max retries exceeded
          throw this.wrapError(error);
        }

        // Calculate and wait for backoff
        const delay = calculateBackoffDelay(attempt);
        
        this.logDebug(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`,
          error
        );

        await sleep(delay);
      }
    }

    throw this.wrapError(lastError);
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // 5xx server errors are retryable
    if (error.status >= 500) {
      return true;
    }

    // 403 with rate limit exceeded
    if (error.status === 403) {
      const isRateLimit = error.message?.includes?.('rate limit') ||
        error.headers?.['x-ratelimit-remaining'] === '0';
      if (isRateLimit) {
        return true;
      }
    }

    // 429 Too Many Requests
    if (error.status === 429) {
      return true;
    }

    // Network errors are retryable
    if (error.name === 'AxiosError' || error.code === 'ECONNRESET') {
      return true;
    }

    return false;
  }

  /**
   * Wraps an error with additional context
   */
  private wrapError(error: any): Error {
    if (error instanceof GitHubApiError) {
      return error;
    }

    const status = error.status || 0;
    const message = error.message || 'Unknown error';

    return new GitHubApiError(
      status,
      message,
      this.traceId,
      error
    );
  }

  /**
   * Logs debug information if DEBUG env var is set
   */
  private logDebug(message: string, error?: any): void {
    if (process.env.DEBUG) {
      console.log(`[GitHubService:${this.traceId}] ${message}`, error || '');
    }
  }
}

// ============================================
// Custom Error Class
// ============================================

/**
 * Custom error class for GitHub API errors
 */
class GitHubApiError extends Error {
  status: number;
  traceId: string;
  originalError: any;

  constructor(
    status: number,
    message: string,
    traceId: string,
    originalError?: any
  ) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.traceId = traceId;
    this.originalError = originalError;
  }

  /**
   * Checks if this is an authentication error
   */
  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /**
   * Checks if this is a rate limit error
   */
  isRateLimitError(): boolean {
    return this.status === 403 || this.status === 429;
  }

  /**
   * Gets retry-after header value if available
   */
  getRetryAfterSeconds(): number {
    const retryAfter = this.originalError?.headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter, 10);
    }
    return 60; // Default to 60 seconds
  }

  /**
   * Gets rate limit reset time from headers
   */
  getRateLimitResetTime(): Date | null {
    const resetHeader = this.originalError?.headers?.['x-ratelimit-reset'];
    if (resetHeader) {
      return new Date(parseInt(resetHeader, 10) * 1000);
    }
    return null;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Creates a GitHubService instance with token from environment
 * 
 * @returns New GitHubService instance
 * @throws Error if GITHUB_TOKEN is not configured
 */
export function createGitHubService(): GitHubService {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN environment variable is not configured. ' +
      'Please set a valid GitHub Personal Access Token.'
    );
  }

  return new GitHubService(token);
}

/**
 * Creates a GitHubService instance with the provided token
 * 
 * @param token - GitHub Personal Access Token
 * @param traceId - Optional trace ID for request correlation
 * @returns New GitHubService instance
 */
export function createGitHubServiceWithToken(token: string, traceId?: string): GitHubService {
  return new GitHubService(token, traceId);
}

// ============================================
// Request Helper Types
// ============================================

/**
 * Generic API response with rate limit info
 */
export interface ApiResponse<T> {
  data: T;
  rateLimitInfo: RateLimitInfo;
}

/**
 * Options for API requests
 */
export interface RequestOptions {
  /**
   * Whether to include rate limit info in response
   * @default true
   */
  includeRateLimit?: boolean;
  
  /**
   * Maximum retry attempts
   * @default 3
   */
  maxRetries?: number;
  
  /**
   * Trace ID for request correlation
   */
  traceId?: string;
}

/**
 * Makes a request with automatic retry and rate limit tracking
 * 
 * @param service - GitHubService instance
 * @param requestFn - Function that makes the actual API request
 * @param options - Request options
 * @returns API response with data and rate limit info
 */
export async function makeRequest<T>(
  service: GitHubService,
  requestFn: () => Promise<{ data: T; headers: any }>,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { includeRateLimit = true, maxRetries = MAX_RETRY_ATTEMPTS } = options;

  const result = await service.executeWithRetry(requestFn, maxRetries);

  // Update rate limit info from response headers
  if (includeRateLimit && result.headers) {
    updateRateLimitFromHeaders(result.headers as any);
  }

  return {
    data: result.data,
    rateLimitInfo: service.getRateLimitInfo(),
  };
}

export { GitHubApiError };
export { GitHubService };
export default GitHubService;