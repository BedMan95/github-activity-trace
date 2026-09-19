/**
 * GitHub Repositories API Route
 * 
 * GET /api/github/repositories
 * 
 * Fetches the authenticated user's repositories with:
 * - 1-hour caching to reduce API calls
 * - Comprehensive error handling for auth, rate limits, and service issues
 * - Proper response format with cached flag
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { NextResponse } from 'next/server';
import { createGitHubService, GitHubApiError } from '@/services/github';
import { getCacheService, CACHE_KEYS } from '@/app/services/cache';
import { getEffectiveGitHubToken } from '@/../lib/settings';
import type { Repository, RateLimitInfo } from '@/types/github';
import type { RepositoriesResponse, ApiErrorResponse } from '@/types/api';

// ============================================
// Response Types
// ============================================

/**
 * Success response structure for repositories endpoint
 */
interface RepositoryApiResponse {
  repositories: Repository[];
  rateLimitInfo: RateLimitInfo;
  cached: boolean;
}

// ============================================
// Error Handling Utilities
// ============================================

/**
 * Creates an appropriate error response based on GitHub API error
 */
function createErrorResponse(error: GitHubApiError): NextResponse<ApiErrorResponse> {
  const status = error.status;
  
  // Authentication errors (401, 403)
  if (status === 401 || status === 403) {
    let message: string;
    let errorType: string;
    
    if (status === 401) {
      message = 'Invalid token. Please check your GitHub token configuration.';
      errorType = 'INVALID_TOKEN';
    } else {
      // Check if it's a rate limit or permissions issue
      const headers = error.originalError?.headers;
      const isRateLimit = error.message?.includes?.('rate limit') || 
                          headers?.['x-ratelimit-remaining'] === '0';
      
      if (isRateLimit) {
        const resetTime = error.getRateLimitResetTime();
        const retryAfter = error.getRetryAfterSeconds();
        message = `Rate limit exceeded. Please try again after ${resetTime?.toLocaleTimeString() || 'later'}.`;
        return NextResponse.json(
          {
            error: 'RATE_LIMIT_EXCEEDED',
            message,
            retryAfter,
          },
          {
            status: 403,
            headers: {
              'Retry-After': String(retryAfter),
            },
          }
        );
      }
      
      message = 'Token permissions insufficient. Please ensure token has repo scope.';
      errorType = 'INSUFFICIENT_PERMISSIONS';
    }
    
    return NextResponse.json(
      {
        error: errorType,
        message,
      },
      { status }
    );
  }
  
  // Rate limit exceeded (429)
  if (status === 429) {
    const retryAfter = error.getRetryAfterSeconds();
    return NextResponse.json(
      {
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
        },
      }
    );
  }
  
  // Service unavailable (5xx)
  if (status >= 500) {
    return NextResponse.json(
      {
        error: 'SERVICE_UNAVAILABLE',
        message: 'GitHub service unavailable. Please try again later.',
        retryAfter: 60,
      },
      { status: 503 }
    );
  }
  
  // Other errors
  return NextResponse.json(
    {
      error: 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred',
    },
    { status: 500 }
  );
}

/**
 * Handles errors from cache service or other sources
 */
function createServiceErrorResponse(message: string, status: number = 500): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: 'SERVICE_ERROR',
      message,
    },
    { status }
  );
}

// ============================================
// Cache Functions
// ============================================

function getTokenCacheKey(): string {
  const token = getEffectiveGitHubToken() || process.env.GITHUB_TOKEN || '';
  if (!token) return 'default';
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

/**
 * Get cached repositories if available and not expired
 */
function getCachedRepositories(): Repository[] | null {
  const cache = getCacheService();
  return cache.get<Repository[]>(CACHE_KEYS.REPOSITORIES, getTokenCacheKey());
}

/**
 * Cache repositories with 1-hour TTL
 */
function cacheRepositories(repositories: Repository[]): void {
  const cache = getCacheService();
  cache.set(CACHE_KEYS.REPOSITORIES, getTokenCacheKey(), repositories, 'repositories');
}

/**
 * Invalidate repository cache (used on auth errors per Requirement 1.5)
 */
function invalidateRepositoryCache(): void {
  const cache = getCacheService();
  cache.invalidate(CACHE_KEYS.REPOSITORIES, getTokenCacheKey());
}

// ============================================
// API Route Handlers
// ============================================

/**
 * GET /api/github/repositories
 * 
 * Fetches authenticated user's repositories from GitHub API
 * with caching and comprehensive error handling.
 * 
 * Response format:
 * {
 *   "repositories": [...],
 *   "rateLimitInfo": { "remaining": number, "resetTime": number, "limit": number },
 *   "cached": boolean
 * }
 */
export async function GET(): Promise<NextResponse<RepositoryApiResponse> | NextResponse<ApiErrorResponse>> {
  try {
    // Check cache first (Requirement 1.4: cache for 1 hour)
    const cachedRepos = getCachedRepositories();
    
    if (cachedRepos) {
      // Return cached data
      return NextResponse.json({
        repositories: cachedRepos,
        rateLimitInfo: {
          remaining: 0,
          resetTime: 0,
          limit: 0,
        },
        cached: true,
      });
    }
    
    // Create GitHub service and fetch repositories
    const service = createGitHubService();
    
    // Fetch repositories and user profile in parallel
    const [octokitResponse, userResponse] = await Promise.all([
      service.getOctokit().repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
        affiliation: 'owner',
      }),
      service.getOctokit().users.getAuthenticated().catch(() => null),
    ]);

    const username = userResponse?.data?.login;
    const reposMap = new Map<string, Repository>();

    // If user is authenticated, query search/commits and push events to find all repos user actually contributed to
    if (username) {
      try {
        const [searchCommitsRes, userEventsRes] = await Promise.all([
          service.getOctokit().search.commits({
            q: `author:${username}`,
            sort: 'author-date',
            order: 'desc',
            per_page: 100,
          }),
          service.getOctokit().activity.listEventsForAuthenticatedUser({
            username,
            per_page: 100,
          }).catch(() => ({ data: [] })),
        ]);

        // Add repos where user committed
        for (const item of searchCommitsRes.data.items) {
          const fn = item.repository.full_name;
          if (!reposMap.has(fn)) {
            reposMap.set(fn, {
              id: item.repository.id,
              name: item.repository.name,
              full_name: fn,
              private: item.repository.private,
              updated_at: item.commit.author?.date || '',
            });
          }
        }

        // Add repos where user pushed
        for (const event of userEventsRes.data) {
          if (event.type === 'PushEvent' && event.repo) {
            const fn = event.repo.name;
            if (!reposMap.has(fn)) {
              reposMap.set(fn, {
                id: event.repo.id,
                name: fn.split('/')[1] || fn,
                full_name: fn,
                private: false,
                updated_at: event.created_at || '',
              });
            }
          }
        }
      } catch {
        // Fallback silently if search limit reached
      }
    }

    // Merge in user's owned repos
    for (const repo of octokitResponse.data) {
      if (!reposMap.has(repo.full_name)) {
        reposMap.set(repo.full_name, {
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          updated_at: repo.updated_at || '',
        });
      }
    }

    // Update rate limit info from response headers
    const headers = octokitResponse.headers as Record<string, string>;
    const rateLimitInfo: RateLimitInfo = {
      remaining: parseInt(headers['x-ratelimit-remaining'] || '5000', 10),
      resetTime: parseInt(headers['x-ratelimit-reset'] || String(Math.floor(Date.now() / 1000) + 3600), 10),
      limit: parseInt(headers['x-ratelimit-limit'] || '5000', 10),
    };

    const repositories: Repository[] = Array.from(reposMap.values());
    
    // Cache the results (Requirement 1.4)
    cacheRepositories(repositories);
    
    // Return success response with cached: false
    return NextResponse.json({
      repositories,
      rateLimitInfo,
      cached: false,
    });
    
  } catch (error) {
    // Handle GitHub API errors
    if (error instanceof GitHubApiError) {
      const githubError = error as GitHubApiError;
      
      // Requirement 1.5: On auth error with expired cache, fail with auth error 
      // and NOT use stale cached data
      if (githubError.isAuthError()) {
        // Invalidate cache to prevent stale data usage
        invalidateRepositoryCache();
      }
      
      return createErrorResponse(githubError);
    }
    
    // Handle token configuration error
    if (error instanceof Error && error.message.includes('GITHUB_TOKEN')) {
      return NextResponse.json(
        {
          error: 'TOKEN_NOT_CONFIGURED',
          message: 'GitHub token not configured. Please contact administrator.',
        },
        { status: 401 }
      );
    }
    
    // Handle unexpected errors
    console.error('[Repositories API] Unexpected error:', error);
    
    return createServiceErrorResponse(
      'An unexpected error occurred while fetching repositories',
      500
    );
  }
}