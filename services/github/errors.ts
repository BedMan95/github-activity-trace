/**
 * GitHub API Error Handling Utilities
 *
 * Provides centralized error handlers for:
 * - 401/403 Authentication and Scope issues
 * - 429/403 Rate Limit issues
 * - 5xx Service Unavailability
 */

import { GitHubApiError } from '../github';

export interface StandardErrorPayload {
  status: number;
  error: string;
  message: string;
  retryAfter?: number;
}

export function handleGitHubServiceError(error: unknown): StandardErrorPayload {
  if (error instanceof GitHubApiError) {
    const status = error.status;

    // Rate Limit (429 or 403 rate limit)
    if (status === 429 || (status === 403 && error.isRateLimitError?.())) {
      const retryAfter = error.getRetryAfterSeconds?.() || 60;
      const resetTime = error.getRateLimitResetTime?.();
      return {
        status,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Please try again after ${resetTime ? resetTime.toLocaleTimeString() : 'later'}.`,
        retryAfter,
      };
    }

    // 401 Unauthorized
    if (status === 401) {
      return {
        status: 401,
        error: 'INVALID_TOKEN',
        message: 'Invalid token. Please check your GitHub token configuration.',
      };
    }

    // 403 Forbidden (Insufficient permissions)
    if (status === 403) {
      return {
        status: 403,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Token permissions insufficient. Please ensure token has repo scope.',
      };
    }

    // 5xx Service Unavailable
    if (status >= 500) {
      return {
        status: 503,
        error: 'SERVICE_UNAVAILABLE',
        message: 'GitHub service unavailable. Please try again later.',
        retryAfter: 60,
      };
    }

    return {
      status,
      error: 'GITHUB_API_ERROR',
      message: error.message || 'GitHub API request failed.',
    };
  }

  if (error instanceof Error && error.message.includes('GITHUB_TOKEN')) {
    return {
      status: 401,
      error: 'TOKEN_NOT_CONFIGURED',
      message: 'GitHub token not configured. Please contact administrator.',
    };
  }

  return {
    status: 500,
    error: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
  };
}
