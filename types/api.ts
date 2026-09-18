// API Response Types for GitHub Commit Activity Tracker
// Defines all successful and error response types for GitHub API interactions

// Import core data model interfaces
import type { Repository, Commit, RateLimitInfo } from './github.js';

// ==============
// API Success Response Types
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

// ==============
// API Error Response Types
// ==============

/**
 * Generic error response for API routes
 * This matches the ErrorResponse type in github.ts but simplified for API responses
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  retryAfter?: number;
}

/**
 * Response for rate limit tracking middleware
 */
export interface RateLimitTrackingResponse {
  remaining: number;
  resetTime: number;
  limit: number;
  warning: boolean; // true if approaching limit (< 10 remaining)
}
