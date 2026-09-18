// ==============
// Core Interfaces
// ==============

/**
 * Represents a GitHub repository
 */
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  updated_at: string;
}

/**
 * Represents a GitHub commit
 */
export interface Commit {
  id: string;
  repository: string;
  message: string;
  date: string;
  author: string;
  sha: string;
  url: string;
}

/**
 * Commit with additional formatted fields for display
 */
export interface CommitWithFormattedDate extends Commit {
  formattedDate: string;
  truncatedMessage: string;
}

/**
 * Filter state for commits
 */
export interface FilterState {
  repository: string | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * GitHub API rate limit information
 * Note: resetTime is stored as Unix timestamp (seconds) for API responses
 */
export interface RateLimitInfo {
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  limit: number;
}

/**
 * Cache entry with timestamp and TTL
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// ==============
// Error Types
// ==============

// Authentication error types
export interface TokenNotConfiguredError {
  type: 'TOKEN_NOT_CONFIGURED';
  message: string;
  recoverable: false;
  action: 'configure_token';
}

export interface InvalidTokenError {
  type: 'INVALID_TOKEN';
  message: string;
  recoverable: true;
  action: 'reconfigure_token';
}

export interface InsufficientPermissionsError {
  type: 'INSUFFICIENT_PERMISSIONS';
  message: string;
  recoverable: true;
  action: 'update_scopes';
}

export interface AuthRateLimitError {
  type: 'AUTH_LIMIT_EXCEEDED';
  message: string;
  recoverable: true;
  retryAfter: number;
  action: 'wait';
}

// Combined authentication error union
export type AuthError =
  | TokenNotConfiguredError
  | InvalidTokenError
  | InsufficientPermissionsError
  | AuthRateLimitError;

// Rate limit error
export interface RateLimitExceededError {
  type: 'RATE_LIMIT_EXCEEDED';
  message: string;
  resetTime: Date;
  remaining: number;
  limit: number;
  retryAfter: number;
  recoverable: true;
  action: 'wait';
}

// Service error types
export interface ServiceUnavailableError {
  type: 'SERVICE_UNAVAILABLE';
  message: string;
  recoverable: true;
  action: 'retry';
}

export interface NetworkError {
  type: 'NETWORK_ERROR';
  message: string;
  recoverable: true;
  action: 'check_connection';
}

// Combined service error union
export type ServiceError = ServiceUnavailableError | NetworkError;

// ==============
// Error State
// ==============

/**
 * Error state for the application
 */
export interface ErrorState {
  authError: AuthError | null;
  rateLimitError: RateLimitExceededError | null;
  serviceError: ServiceError | null;
  authenticationRetries: number;
  lastAuthAttempt: Date | null;
}

/**
 * Generic error response for API routes
 */
export interface ErrorResponse {
  error: string;
  message: string;
  retryAfter?: number;
}

/**
 * Success response with rate limit info
 */
export interface SuccessWithRateLimit<T> {
  data: T;
  rateLimitInfo: RateLimitInfo;
  cached: boolean;
}

/**
 * Cache status response
 */
export interface CacheStatus {
  cached: boolean;
  timestamp: number;
  ttl: number;
}

// ==============
// API Response Types
// ==============

/**
 * Response from /api/github/repositories endpoint
 */
export interface RepositoriesResponse {
  repositories: Repository[];
  rateLimitInfo: RateLimitInfo;
  cached: boolean;
}

/**
 * Response from /api/github/commits endpoint
 */
export interface CommitsResponse {
  commits: Commit[];
  rateLimitInfo: RateLimitInfo;
  cached: boolean;
}

/**
 * Exported CSV content
 */
export interface CSVExport {
  headers: string[];
  rows: string[][];
}

/**
 * Loading state for UI components
 */
export interface LoadingState {
  isLoading: boolean;
  progress: number;
  estimatedTime?: number;
}
