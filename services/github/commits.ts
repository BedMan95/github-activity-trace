/**
 * GitHub Commits Service
 * 
 * Provides commit fetching with:
 * - Concurrent request limiting (max 5 concurrent)
 * - Author filtering and date range parameters
 * - Per-repository caching
 * 
 * @file services/github/commits.ts
 */

import { Octokit } from '@octokit/rest';
import {
  Commit,
  Repository,
  RateLimitInfo,
} from '../../types/github';
import {
  getCacheService,
  CacheService,
} from '../cache';
import {
  GitHubService,
  createGitHubService,
  makeRequest,
} from '../github';

// ============================================
// Configuration Constants
// ============================================

/**
 * Maximum concurrent requests to GitHub API
 */
export const MAX_CONCURRENT_REQUESTS = 5;

/**
 * Default author for commits (authenticated user)
 */
const DEFAULT_AUTHOR = '';

/**
 * Default number of commits per page
 */
const COMMITS_PER_PAGE = 100;

/**
 * Maximum pages to fetch per repository
 */
const MAX_PAGES_PER_REPO = 10;

// ============================================
// Request Queue for Concurrency Control
// ============================================

/**
 * A simple semaphore-based request queue for limiting concurrent requests
 */
class RequestQueue {
  private running: number = 0;
  private pending: Array<() => void> = [];
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number = MAX_CONCURRENT_REQUESTS) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Execute a function with concurrency limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.pending.push(resolve);
      });
    }

    this.running++;

    try {
      return await fn();
    } finally {
      this.running--;
      // Start next pending request if any
      if (this.pending.length > 0) {
        const next = this.pending.shift()!;
        next();
      }
    }
  }

  /**
   * Get current number of running requests
   */
  getRunningCount(): number {
    return this.running;
  }

  /**
   * Get current number of pending requests
   */
  getPendingCount(): number {
    return this.pending.length;
  }
}

// ============================================
// Fetch Options
// ============================================

/**
 * Options for fetching commits
 */
export interface FetchCommitsOptions {
  /**
   * Repository to fetch commits from (required)
   */
  repository: Repository;
  
  /**
   * Author username to filter by (optional, defaults to authenticated user)
   */
  author?: string;
  
  /**
   * Start date for commit range (ISO 8601 format)
   */
  since?: string;
  
  /**
   * End date for commit range (ISO 8601 format)
   */
  until?: string;
  
  /**
   * Whether to bypass cache
   */
  bypassCache?: boolean;
  
  /**
   * Maximum number of pages to fetch
   */
  maxPages?: number;
}

/**
 * Result of fetching commits for a repository
 */
export interface FetchCommitsResult {
  commits: Commit[];
  cached: boolean;
  rateLimitInfo: RateLimitInfo;
}

/**
 * Result of fetching commits from multiple repositories
 */
export interface FetchAllCommitsResult {
  results: Map<string, FetchCommitsResult>;
  errors: Map<string, Error>;
  totalCommits: number;
  rateLimitInfo: RateLimitInfo;
}

// ============================================
// Commit Fetching Functions
// ============================================

/**
 * Transforms GitHub API commit response to our Commit type
 */
function transformCommit(
  repoFullName: string,
  ghCommit: {
    sha: string;
    commit: {
      message: string;
      author: {
        date: string;
        name: string;
        email: string;
      };
    };
    html_url: string;
  }
): Commit {
  return {
    id: ghCommit.sha,
    repository: repoFullName,
    message: ghCommit.commit.message,
    date: ghCommit.commit.author.date,
    author: ghCommit.commit.author.name,
    sha: ghCommit.sha.substring(0, 7),
    url: ghCommit.html_url,
  };
}

/**
 * Check if a commit falls within the specified date range
 */
function isCommitInDateRange(
  commit: Commit,
  since?: string,
  until?: string
): boolean {
  const commitDate = new Date(commit.date).getTime();
  
  if (since) {
    const sinceDate = new Date(since).getTime();
    if (commitDate < sinceDate) {
      return false;
    }
  }
  
  if (until) {
    const untilDate = new Date(until).getTime();
    // Include commits up to and including the until date
    if (commitDate > untilDate + 86400000) { // Add 24 hours to include the entire "until" day
      return false;
    }
  }
  
  return true;
}

/**
 * Fetch commits for a single repository with caching support
 * 
 * @param service - GitHubService instance
 * @param cache - CacheService instance
 * @param options - Fetch options
 * @returns FetchCommitsResult with commits, cache status, and rate limit info
 */
export async function fetchRepositoryCommits(
  service: GitHubService,
  cache: CacheService,
  options: FetchCommitsOptions
): Promise<FetchCommitsResult> {
  const { repository, author, since, until, bypassCache = false, maxPages = MAX_PAGES_PER_REPO } = options;
  
  // Check cache first (unless bypassing)
  if (!bypassCache) {
    const cached = cache.getCommits(repository.full_name);
    if (cached) {
      // Filter cached commits by date range
      const filtered = since || until
        ? cached.filter((c: Commit) => isCommitInDateRange(c, since, until))
        : cached;
      
      // If author filtering is needed, filter by author too
      const authorFiltered = author
        ? filtered.filter((c: Commit) => c.author.toLowerCase().includes(author.toLowerCase()))
        : filtered;
      
      return {
        commits: authorFiltered,
        cached: true,
        rateLimitInfo: service.getRateLimitInfo(),
      };
    }
  }

  const octokit = service.getOctokit();
  const allCommits: Commit[] = [];
  let page = 1;
  let hasMorePages = true;

  // Fetch commits with pagination
  while (hasMorePages && page <= maxPages) {
    const response = await makeRequest<any[]>(
      service,
      () => octokit.repos.listCommits({
        owner: repository.full_name.split('/')[0],
        repo: repository.full_name.split('/')[1],
        author,
        since: since ? new Date(since).toISOString() : undefined,
        until: until ? new Date(until).toISOString() : undefined,
        per_page: COMMITS_PER_PAGE,
        page,
      }),
      { includeRateLimit: true }
    );

    if (response.data.length === 0) {
      hasMorePages = false;
      break;
    }

    // Transform commits
    const pageCommits = response.data.map((c: any) => transformCommit(repository.full_name, c));
    allCommits.push(...pageCommits);

    // Check if we got fewer results than requested (likely last page)
    if (response.data.length < COMMITS_PER_PAGE) {
      hasMorePages = false;
    } else {
      page++;
    }
  }

  // Cache the full commit list (unfiltered)
  cache.setCommits(repository.full_name, allCommits);

  // Apply client-side filtering for the response
  const filtered = since || until
    ? allCommits.filter(c => isCommitInDateRange(c, since, until))
    : allCommits;
    
  const authorFiltered = author
    ? filtered.filter(c => c.author.toLowerCase().includes(author.toLowerCase()))
    : filtered;

  return {
    commits: authorFiltered,
    cached: false,
    rateLimitInfo: service.getRateLimitInfo(),
  };
}

/**
 * Fetch commits from multiple repositories with concurrent limiting
 * 
 * @param repositories - Array of repositories to fetch commits from
 * @param options - Common fetch options (author, since, until)
 * @param service - Optional GitHubService instance (creates new one if not provided)
 * @param cache - Optional CacheService instance (uses singleton if not provided)
 * @returns FetchAllCommitsResult with all commits, errors, and aggregate info
 */
export async function fetchAllRepositoryCommits(
  repositories: Repository[],
  options: {
    author?: string;
    since?: string;
    until?: string;
    bypassCache?: boolean;
  },
  service?: GitHubService,
  cache?: CacheService
): Promise<FetchAllCommitsResult> {
  // Use provided services or create defaults
  const githubService = service || createGitHubService();
  const cacheService = cache || getCacheService();

  // Create request queue for concurrency limiting
  const queue = new RequestQueue(MAX_CONCURRENT_REQUESTS);
  
  // Track results and errors
  const results = new Map<string, FetchCommitsResult>();
  const errors = new Map<string, Error>();
  let totalCommits = 0;

  // Create fetch promises with concurrency limiting
  const fetchPromises = repositories.map(async (repo) => {
    return queue.execute(async () => {
      try {
        const result = await fetchRepositoryCommits(githubService, cacheService, {
          repository: repo,
          author: options.author,
          since: options.since,
          until: options.until,
          bypassCache: options.bypassCache,
        });
        
        results.set(repo.full_name, result);
        totalCommits += result.commits.length;
      } catch (error) {
        errors.set(repo.full_name, error as Error);
        // Don't throw - continue with other repositories
      }
    });
  });

  // Wait for all fetches to complete
  await Promise.all(fetchPromises);

  return {
    results,
    errors,
    totalCommits,
    rateLimitInfo: githubService.getRateLimitInfo(),
  };
}

/**
 * Invalidate commit cache for a specific repository
 * 
 * @param repositoryFullName - Full name of the repository (owner/repo)
 * @param cache - Optional CacheService instance
 */
export function invalidateRepositoryCommits(
  repositoryFullName: string,
  cache?: CacheService
): void {
  const cacheService = cache || getCacheService();
  cacheService.invalidateCommits(repositoryFullName);
}

/**
 * Invalidate commit cache for all repositories
 * 
 * @param cache - Optional CacheService instance
 */
export function invalidateAllCommitCache(cache?: CacheService): void {
  const cacheService = cache || getCacheService();
  cacheService.invalidateCommits(); // No argument clears all
}

/**
 * Fetch commits with a simple API for single repository
 * 
 * This is a convenience function for fetching commits from one repository.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param options - Optional fetch parameters (author, since, until)
 * @returns FetchCommitsResult
 */
export async function fetchCommits(
  owner: string,
  repo: string,
  options: {
    author?: string;
    since?: string;
    until?: string;
    bypassCache?: boolean;
  } = {}
): Promise<FetchCommitsResult> {
  const service = createGitHubService();
  const cache = getCacheService();

  // Create a minimal Repository object
  const repository: Repository = {
    id: 0,
    name: repo,
    full_name: `${owner}/${repo}`,
    private: false,
    updated_at: new Date().toISOString(),
  };

  return fetchRepositoryCommits(service, cache, {
    repository,
    author: options.author,
    since: options.since,
    until: options.until,
    bypassCache: options.bypassCache,
  });
}

// ============================================
// Export request queue for advanced use
// ============================================

export { RequestQueue };