/**
 * GitHub Commits API Route
 * 
 * GET /api/github/commits
 * 
 * Fetches commits from all or specified repositories with:
 * - Query parameter validation (date range, repository filter)
 * - Concurrent request limiting (max 5 concurrent requests)
 * - 1-hour caching per repository
 * - Comprehensive error handling for auth, rate limits, and service issues
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { NextResponse } from 'next/server';
import { createGitHubService, GitHubApiError, MAX_CONCURRENT_REQUESTS } from '@/services/github';
import { getCacheService, CACHE_KEYS } from '@/app/services/cache';
import type { Commit, Repository, RateLimitInfo } from '@/types/github';
import type { CommitsResponse, ApiErrorResponse } from '@/types/api';

// ============================================
// Query Parameter Types
// ============================================

/**
 * Valid query parameters for commits endpoint
 */
interface CommitsQueryParams {
  repository?: string;      // Filter by specific repository (owner/repo format)
  startDate?: string;       // ISO 8601 date string for start of range
  endDate?: string;         // ISO 8601 date string for end of range
  author?: string;          // Filter by author name or email
  perPage?: string;         // Commits per repository (default: 100)
  page?: string;            // Page number (default: 1)
}

// ============================================
// Query Validation
// ============================================

/**
 * Validates query parameters and returns cleaned params or error response
 */
function validateQueryParams(params: CommitsQueryParams): { 
  valid: boolean; 
  cleaned: CommitsQueryParams; 
  error?: NextResponse<ApiErrorResponse> 
} {
  const cleaned: CommitsQueryParams = {};
  let errorMessage: string | undefined;

  // Validate repository format (owner/repo or comma-separated list)
  if (params.repository !== undefined) {
    const repos = params.repository.split(',').map(r => r.trim()).filter(Boolean);
    const repoRegex = /^[^/]+\/[^/]+$/;
    const invalid = repos.find(r => !repoRegex.test(r));
    if (invalid || repos.length === 0) {
      errorMessage = 'Invalid repository format. Use "owner/repo" format.';
    } else {
      cleaned.repository = repos.join(',');
    }
  }

  // Validate date range
  if (params.startDate !== undefined) {
    const startDate = new Date(params.startDate);
    if (isNaN(startDate.getTime())) {
      errorMessage = 'Invalid startDate format. Use ISO 8601 date string.';
    } else if (startDate > new Date()) {
      errorMessage = 'startDate cannot be in the future.';
    } else {
      cleaned.startDate = params.startDate;
    }
  }

  if (params.endDate !== undefined) {
    const endDate = new Date(params.endDate);
    if (isNaN(endDate.getTime())) {
      errorMessage = 'Invalid endDate format. Use ISO 8601 date string.';
    } else {
      cleaned.endDate = params.endDate;
    }
  }

  // Validate date range consistency
  if (cleaned.startDate && cleaned.endDate) {
    const start = new Date(cleaned.startDate).getTime();
    const end = new Date(cleaned.endDate).getTime();
    if (start > end) {
      errorMessage = 'startDate must be before or equal to endDate.';
    }
  }

  // Validate author filter
  if (params.author !== undefined) {
    if (params.author.trim().length === 0) {
      errorMessage = 'Author filter cannot be empty.';
    } else {
      cleaned.author = params.author.trim();
    }
  }

  // Validate pagination
  if (params.perPage !== undefined) {
    const perPage = parseInt(params.perPage, 10);
    if (isNaN(perPage) || perPage < 1 || perPage > 100) {
      errorMessage = 'perPage must be a number between 1 and 100.';
    } else {
      cleaned.perPage = params.perPage;
    }
  }

  if (params.page !== undefined) {
    const page = parseInt(params.page, 10);
    if (isNaN(page) || page < 1) {
      errorMessage = 'page must be a positive number.';
    } else {
      cleaned.page = params.page;
    }
  }

  if (errorMessage) {
    return {
      valid: false,
      cleaned,
      error: NextResponse.json(
        {
          error: 'INVALID_QUERY_PARAMS',
          message: errorMessage,
        },
        { status: 400 }
      ),
    };
  }

  return { valid: true, cleaned };
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
 * Creates a service error response
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
// Commit Fetching Logic
// ============================================

/**
 * Fetches commits for a single repository
 */
async function fetchRepositoryCommits(
  service: ReturnType<typeof createGitHubService>,
  repoFullName: string,
  perPage: number,
  page: number,
  authorFilter?: string
): Promise<Commit[]> {
  const [owner, repo] = repoFullName.split('/');

  const params: {
    owner: string;
    repo: string;
    per_page: number;
    page: number;
    author?: string;
  } = {
    owner,
    repo,
    per_page: perPage,
    page,
  };

  if (authorFilter) {
    params.author = authorFilter;
  }

  const response = await service.getOctokit().repos.listCommits(params);

  // Transform to our Commit interface
  return response.data.map(commit => ({
    id: commit.sha,
    repository: repoFullName,
    message: commit.commit.message,
    date: commit.commit.author?.date || commit.commit.committer?.date || '',
    author: commit.commit.author?.name || commit.commit.committer?.name || 'Unknown',
    sha: commit.sha,
    url: commit.html_url,
  }));
}

/**
 * Fetches commits from multiple repositories with concurrent limiting
 * Requirement 2.1: Concurrent request limiting (max 5 concurrent)
 */
async function fetchCommitsFromRepositories(
  service: ReturnType<typeof createGitHubService>,
  repositories: Repository[],
  perPage: number,
  page: number,
  startDate?: string,
  endDate?: string,
  authorFilter?: string
): Promise<Commit[]> {
  const allCommits: Commit[] = [];

  // Use concurrent request limiting (max 5 concurrent per Requirement 2.1)
  const semaphore = { count: 0, maxConcurrent: MAX_CONCURRENT_REQUESTS, waiting: [] as (() => void)[] };
  
  const fetchWithLimit = async (repo: Repository): Promise<void> => {
    return new Promise((resolve) => {
      // Acquire semaphore
      const tryAcquire = () => {
        if (semaphore.count < semaphore.maxConcurrent) {
          semaphore.count++;
          resolve();
          // Release when done
          Promise.resolve().then(() => {
            semaphore.count--;
            // Process waiting queue
            const next = semaphore.waiting.shift();
            if (next) {
              semaphore.count++;
              next();
            }
          });
        } else {
          semaphore.waiting.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  };

  // Create fetch promises for all repositories
  const fetchPromises = repositories.map(async (repo) => {
    await fetchWithLimit(repo);
    
    try {
      const commits = await fetchRepositoryCommits(service, repo.full_name, perPage, page);
      cacheCommits(repo.full_name, commits);
      
      // Apply date range filter (Requirement 2.2)
      let filteredCommits = commits;
      if (startDate) {
        const start = new Date(startDate).getTime();
        filteredCommits = filteredCommits.filter(c => new Date(c.date).getTime() >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000); // Include full end day
        filteredCommits = filteredCommits.filter(c => new Date(c.date).getTime() < end);
      }
      
      // Apply author filter (Requirement 2.3)
      if (authorFilter) {
        const authorLower = authorFilter.toLowerCase();
        filteredCommits = filteredCommits.filter(c => 
          c.author.toLowerCase().includes(authorLower)
        );
      }
      
      allCommits.push(...filteredCommits);
    } catch (error) {
      // Log error but continue with other repositories
      console.error(`[Commits API] Error fetching commits for ${repo.full_name}:`, error);
    }
  });

  await Promise.all(fetchPromises);

  return allCommits;
}

// ============================================
// Cache Functions
// ============================================

/**
 * Gets cached commits for a specific repository if available
 */
function getCachedCommits(repoName: string): Commit[] | null {
  const cache = getCacheService();
  return cache.get<Commit[]>(CACHE_KEYS.COMMITS, repoName);
}

/**
 * Caches commits for a specific repository with 1-hour TTL (Requirement 2.4)
 */
function cacheCommits(repoName: string, commits: Commit[]): void {
  const cache = getCacheService();
  cache.set(CACHE_KEYS.COMMITS, repoName, commits, 'commits');
}

/**
 * Invalidates commit cache for a specific repository
 */
function invalidateCommitCache(repoName?: string): void {
  const cache = getCacheService();
  if (repoName) {
    cache.invalidate(CACHE_KEYS.COMMITS, repoName);
  } else {
    cache.invalidateCommits();
  }
}

/**
 * Gets cached repositories if available
 */
function getCachedRepositories(): Repository[] | null {
  const cache = getCacheService();
  return cache.get<Repository[]>(CACHE_KEYS.REPOSITORIES);
}

/**
 * Caches repositories with 1-hour TTL
 */
function cacheRepositories(repositories: Repository[]): void {
  const cache = getCacheService();
  cache.set(CACHE_KEYS.REPOSITORIES, undefined, repositories, 'repositories');
}

// ============================================
// API Route Handlers
// ============================================

/**
 * GET /api/github/commits
 * 
 * Fetches commits from GitHub repositories with:
 * - Query parameter validation
 * - Date range and repository filtering
 * - Concurrent request limiting (max 5)
 * - Caching per repository
 * 
 * Query Parameters:
 * - repository: Filter by specific repository (owner/repo format)
 * - startDate: ISO 8601 date string for start of range
 * - endDate: ISO 8601 date string for end of range
 * - author: Filter by author name
 * - perPage: Commits per repository (1-100, default: 100)
 * - page: Page number (default: 1)
 * 
 * Response format:
 * {
 *   "commits": [...],
 *   "rateLimitInfo": { "remaining": number, "resetTime": number, "limit": number },
 *   "cached": boolean
 * }
 */
export async function GET(
  request: Request
): Promise<NextResponse<CommitsResponse> | NextResponse<ApiErrorResponse>> {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams: CommitsQueryParams = {
      repository: searchParams.get('repository') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      author: searchParams.get('author') || undefined,
      perPage: searchParams.get('perPage') || undefined,
      page: searchParams.get('page') || undefined,
    };

    // Validate query parameters
    const validation = validateQueryParams(queryParams);
    if (!validation.valid) {
      return validation.error!;
    }

    const { repository: repoFilter, startDate, endDate, author, perPage = '100', page = '1' } = validation.cleaned;
    const perPageNum = parseInt(perPage, 10);
    const pageNum = parseInt(page, 10);

    // Create GitHub service
    const service = createGitHubService();

    // Resolve authenticated user to filter commits to user's activity
    const authenticatedUser = await service.getOctokit().users.getAuthenticated().catch(() => null);
    const effectiveAuthor = author || authenticatedUser?.data?.login || undefined;

    // If specific repository (or multiple repositories) is requested
    if (repoFilter) {
      const requestedRepos = repoFilter.split(',').map(r => r.trim()).filter(Boolean);
      const allSelectedCommits: Commit[] = [];
      let allCached = true;

      for (const targetRepo of requestedRepos) {
        let repoCommits = getCachedCommits(targetRepo);
        if (repoCommits) {
          allSelectedCommits.push(...repoCommits);
        } else {
          allCached = false;
          try {
            const fetched = await fetchRepositoryCommits(service, targetRepo, perPageNum, pageNum, effectiveAuthor);
            cacheCommits(targetRepo, fetched);
            allSelectedCommits.push(...fetched);
          } catch (error) {
            if (error instanceof GitHubApiError && requestedRepos.length === 1) {
              return createErrorResponse(error);
            }
            // If multiple repos, continue with others instead of failing completely
          }
        }
      }

      // Apply filters
      let filtered = allSelectedCommits;
      if (startDate) {
        const start = new Date(startDate).getTime();
        filtered = filtered.filter(c => new Date(c.date).getTime() >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000);
        filtered = filtered.filter(c => new Date(c.date).getTime() < end);
      }
      if (effectiveAuthor) {
        const authorLower = effectiveAuthor.toLowerCase();
        filtered = filtered.filter(c =>
          c.author.toLowerCase().includes(authorLower) ||
          (authenticatedUser?.data?.login && authorLower === authenticatedUser.data.login.toLowerCase())
        );
      }

      filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return NextResponse.json({
        commits: filtered,
        rateLimitInfo: service.getRateLimitInfo(),
        cached: allCached,
      });
    }

    // Fetch repositories for multi-repo commit fetching
    let repositories = getCachedRepositories();

    if (!repositories) {
      const reposMap = new Map<string, Repository>();
      const username = authenticatedUser?.data?.login;

      // Find repos where user committed or pushed
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

      // Fetch user's owned repos
      const octokitResponse = await service.getOctokit().repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
        affiliation: 'owner',
      });

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

      repositories = Array.from(reposMap.values());
      cacheRepositories(repositories);
    }

    // Check per-repository cache first to avoid redundant API calls
    const uncachedRepos: Repository[] = [];
    const cachedCommitsList: Commit[] = [];

    for (const repo of repositories) {
      const cached = getCachedCommits(repo.full_name);
      if (cached) {
        let filtered = cached;
        if (startDate) {
          const start = new Date(startDate).getTime();
          filtered = filtered.filter(c => new Date(c.date).getTime() >= start);
        }
        if (endDate) {
          const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000);
          filtered = filtered.filter(c => new Date(c.date).getTime() < end);
        }
        if (effectiveAuthor) {
          const authorLower = effectiveAuthor.toLowerCase();
          filtered = filtered.filter(c => c.author.toLowerCase().includes(authorLower));
        }
        cachedCommitsList.push(...filtered);
      } else {
        uncachedRepos.push(repo);
      }
    }

    // Only fetch repositories that aren't cached yet (top 15 active to keep response fast)
    const reposToFetch = uncachedRepos.slice(0, 15);
    const freshCommits = reposToFetch.length > 0
      ? await fetchCommitsFromRepositories(
          service,
          reposToFetch,
          perPageNum,
          pageNum,
          startDate,
          endDate,
          effectiveAuthor
        )
      : [];

    const commits = [...cachedCommitsList, ...freshCommits];

    // Sort by date descending
    commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      commits,
      rateLimitInfo: service.getRateLimitInfo(),
      cached: uncachedRepos.length === 0,
    });

  } catch (error) {
    // Handle GitHub API errors
    if (error instanceof GitHubApiError) {
      return createErrorResponse(error);
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
    console.error('[Commits API] Unexpected error:', error);
    
    return createServiceErrorResponse(
      'An unexpected error occurred while fetching commits',
      500
    );
  }
}