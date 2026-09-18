/**
 * GitHub Repository Fetching Service
 * 
 * Provides repository fetching functionality with:
 * - Automatic pagination for users with many repositories
 * - Integration with CacheService for 1-hour caching
 * - Cache invalidation on authentication failures
 * - Comprehensive error handling
 * 
 * @file services/github/repositories.ts
 */

import { Octokit } from '@octokit/rest';
import {
  GitHubService,
  GitHubApiError,
  MAX_RETRY_ATTEMPTS,
  updateRateLimitFromHeaders,
} from '../github';
import type { Repository, RateLimitInfo } from '../../types/github';

// ============================================
// Pagination Configuration
// ============================================

/**
 * Number of repositories per page
 * GitHub API maximum is 100
 */
const PER_PAGE = 100;

/**
 * Maximum number of pages to fetch
 * This limits total repositories to 1000 (10 pages * 100 per page)
 * Most users won't hit this limit
 */
const MAX_PAGES = 10;

// ============================================
// Pagination Types
// ============================================

/**
 * Pagination state for repository fetching
 */
export type PaginationState = {
  page: number;
  perPage: number;
  hasNextPage: boolean;
  totalCount?: number;
};

/**
 * Result of fetching a single page
 */
export type PageResult<T> = {
  data: T[];
  pagination: PaginationState;
  rateLimitInfo: RateLimitInfo;
};

/**
 * Complete result of fetching all repositories across pages
 */
export type FetchAllResult<T> = {
  data: T[];
  totalPages: number;
  totalCount: number;
  rateLimitInfo: RateLimitInfo;
  fromCache: boolean;
};

// ============================================
// Repository Fetching Functions
// ============================================

/**
 * Fetches a single page of repositories for the authenticated user
 * 
 * @param service - GitHubService instance
 * @param page - Page number (1-indexed for GitHub API)
 * @param perPage - Number of repositories per page (max 100)
 * @returns PageResult with repository data and pagination state
 */
export async function fetchRepositoriesPage(
  service: GitHubService,
  page: number = 1,
  perPage: number = PER_PAGE
): Promise<PageResult<Repository>> {
  // Fetch a single page of repositories
  const response = await service.executeWithRetry(
    () =>
      service.getOctokit().repos.listForAuthenticatedUser({
        sort: 'updated' as const,
        direction: 'desc' as const,
        page,
        per_page: perPage,
      }),
    MAX_RETRY_ATTEMPTS
  );

  // Update rate limit tracking
  updateRateLimitFromHeaders(response.headers as Record<string, string>);

  // Check for next page in Link header
  const linkHeader = response.headers.link as string | undefined;
  const hasNextPage = linkHeader?.includes('rel="next"') ?? false;

  // Get total count from X-Total header if available
  const totalCount = parseInt(
    response.headers['x-total-count'] as string || '0',
    10
  );

  // Transform to our Repository interface
  const repositories: Repository[] = response.data.map((repo: any) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    private: repo.private,
    updated_at: repo.updated_at || '',
  }));

  return {
    data: repositories,
    pagination: {
      page,
      perPage,
      hasNextPage,
      totalCount: totalCount || repositories.length,
    },
    rateLimitInfo: service.getRateLimitInfo(),
  };
}

/**
 * Fetches all repositories for the authenticated user with automatic pagination
 * 
 * This function handles pagination automatically, fetching all pages until:
 * - All pages are exhausted (no next page link)
 * - Maximum page count is reached (safety limit)
 * - An error occurs
 * 
 * @param service - GitHubService instance
 * @param maxPages - Maximum number of pages to fetch (default: 10)
 * @returns FetchAllResult with all repositories and metadata
 * @throws {GitHubApiError} When GitHub API returns an error
 */
export async function fetchAllRepositories(
  service: GitHubService,
  maxPages: number = MAX_PAGES
): Promise<FetchAllResult<Repository>> {
  const allRepositories: Repository[] = [];
  let page = 1;
  let rateLimitInfo: RateLimitInfo = {
    remaining: 5000,
    resetTime: Math.floor(Date.now() / 1000) + 3600,
    limit: 5000,
  };

  while (page <= maxPages) {
    const result = await fetchRepositoriesPage(service, page);

    allRepositories.push(...result.data);
    rateLimitInfo = result.rateLimitInfo;

    // Stop if no more pages
    if (!result.pagination.hasNextPage) {
      break;
    }

    page++;
  }

  return {
    data: allRepositories,
    totalPages: page,
    totalCount: allRepositories.length,
    rateLimitInfo,
    fromCache: false,
  };
}

/**
 * Cache interface for repository caching operations
 */
interface RepositoryCacheInterface {
  get: <T>(prefix: string, identifier?: string) => T | null;
  set: <T>(prefix: string, identifier: string | undefined, data: T, type: 'repositories' | 'commits' | 'rate_limit_error') => void;
  invalidate: (prefix: string, identifier?: string) => void;
}

/**
 * Main function to fetch repositories with caching support
 * 
 * This is the primary entry point for repository fetching. It:
 * 1. Checks the cache first for valid (non-expired) data
 * 2. If cache miss, fetches from GitHub API with pagination
 * 3. Caches the result on successful fetch
 * 4. Invalidates cache on authentication errors (per Requirement 1.5)
 * 
 * @param service - GitHubService instance
 * @param cache - Optional cache service instance (uses singleton if not provided)
 * @returns FetchAllResult with repositories and metadata
 */
export async function fetchRepositories(
  service: GitHubService,
  cache?: RepositoryCacheInterface
): Promise<FetchAllResult<Repository>> {
  // Use provided cache or import from existing service
  const cacheService = cache || getCacheService();

  // Check cache first
  const cachedData = cacheService.get<Repository[]>('repositories');
  
  if (cachedData) {
    return {
      data: cachedData,
      totalPages: 1,
      totalCount: cachedData.length,
      rateLimitInfo: service.getRateLimitInfo(),
      fromCache: true,
    };
  }

  // Fetch all repositories from GitHub
  const result = await fetchAllRepositories(service);

  // Cache the result
  cacheService.set('repositories', undefined, result.data, 'repositories');

  return {
    ...result,
    fromCache: false,
  };
}

/**
 * Fetches repositories with cache invalidation on auth error
 * 
 * This wrapper ensures that on authentication failures:
 * 1. The cache is invalidated
 2. The auth error is re-thrown (as per Requirement 1.5)
 * 
 * @param service - GitHubService instance
 * @param cache - Optional cache service instance
 * @returns FetchAllResult with repositories and metadata
 * @throws {GitHubApiError} When GitHub API returns auth error (after cache invalidation)
 */
export async function fetchRepositoriesWithAuthHandling(
  service: GitHubService,
  cache?: RepositoryCacheInterface
): Promise<FetchAllResult<Repository>> {
  try {
    return await fetchRepositories(service, cache);
  } catch (error: unknown) {
    // Handle authentication errors per Requirement 1.5
    if (error instanceof GitHubApiError && error.isAuthError()) {
      // Invalidate cache to prevent stale data usage
      // This ensures we fail with auth error and NOT use stale cached data
      const cacheService = cache || getCacheService();
      cacheService.invalidate('repositories');
      
      // Re-throw the auth error - caller should handle user notification
      throw error;
    }
    
    // Re-throw non-auth errors
    throw error;
  }
}

// ============================================
// Cache Integration (Lazy Import)
// ============================================

/**
 * Gets the singleton cache service from the app layer
 * This is a lazy import to avoid circular dependencies
 */
function getCacheService(): RepositoryCacheInterface {
  // Dynamic import to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cacheModule = require('@/app/services/cache');
  return cacheModule.getCacheService();
}