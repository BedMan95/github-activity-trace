/**
 * Cache Service
 * 
 * Provides in-memory caching with TTL for:
 * - Repository lists (1-hour TTL)
 * - Commit history per repository (1-hour TTL)
 * - Rate limit error states (5-minute TTL)
 * 
 * @file services/cache.ts
 */

import type { Repository, Commit } from '../types/github';

// ============================================
// TTL Constants
// ============================================

/**
 * Time-to-live for repository cache (1 hour in milliseconds)
 */
const REPO_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Time-to-live for commit cache (1 hour in milliseconds)
 */
const COMMIT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Time-to-live for error cache (5 minutes in milliseconds)
 */
const ERROR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// Cache Entry Types
// ============================================

/**
 * Generic cache entry with data, timestamp, and TTL
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Cache state interface
 */
interface CacheState {
  repositories: CacheEntry<Repository[]> | null;
  commits: Record<string, CacheEntry<Commit[]>>;
  rateLimitError: CacheEntry<boolean> | null;
}

// ============================================
// CacheService Class
// ============================================

/**
 * CacheService provides in-memory caching with configurable TTL
 * 
 * Features:
 * - Per-repository commit caching
 * - Automatic expiration based on TTL
 * - Cache invalidation methods
 * - Rate limit error caching
 * 
 * **Validates: Requirements 1.4, 1.5, 3.5, 8.3**
 */
class CacheService {
  private cache: CacheState;

  /**
   * Creates a new CacheService instance
   */
  constructor() {
    this.cache = {
      repositories: null,
      commits: {},
      rateLimitError: null,
    };
  }

  // ========================================
  // Repository Cache Methods
  // ========================================

  /**
   * Gets cached repositories if not expired
   * 
   * @returns Cached repositories or null if cache miss/expired
   */
  getRepositories(): Repository[] | null {
    const entry = this.cache.repositories;
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Cache expired, clear it
      this.cache.repositories = null;
      return null;
    }

    return entry.data;
  }

  /**
   * Caches repositories with 1-hour TTL
   * 
   * @param repositories - Repository array to cache
   */
  setRepositories(repositories: Repository[]): void {
    this.cache.repositories = {
      data: repositories,
      timestamp: Date.now(),
      ttl: REPO_CACHE_TTL,
    };
  }

  /**
   * Invalidates the repository cache
   */
  invalidateRepositories(): void {
    this.cache.repositories = null;
  }

  // ========================================
  // Commit Cache Methods
  // ========================================

  /**
   * Gets cached commits for a repository if not expired
   * 
   * @param repoName - Repository name (owner/repo format)
   * @returns Cached commits or null if cache miss/expired
   */
  getCommits(repoName: string): Commit[] | null {
    const entry = this.cache.commits[repoName];
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Cache expired, clear it
      delete this.cache.commits[repoName];
      return null;
    }

    return entry.data;
  }

  /**
   * Caches commits for a repository with 1-hour TTL
   * 
   * @param repoName - Repository name (owner/repo format)
   * @param commits - Commit array to cache
   */
  setCommits(repoName: string, commits: Commit[]): void {
    this.cache.commits[repoName] = {
      data: commits,
      timestamp: Date.now(),
      ttl: COMMIT_CACHE_TTL,
    };
  }

  /**
   * Invalidates commit cache for a specific repository
   * 
   * @param repoName - Repository name to invalidate (optional, clears all if not provided)
   */
  invalidateCommits(repoName?: string): void {
    if (repoName) {
      delete this.cache.commits[repoName];
    } else {
      this.cache.commits = {};
    }
  }

  // ========================================
  // Error Cache Methods
  // ========================================

  /**
   * Gets cached rate limit error state
   * 
   * @returns true if rate limit error is cached and not expired
   */
  isRateLimitErrorCached(): boolean {
    const entry = this.cache.rateLimitError;
    
    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Cache expired, clear it
      this.cache.rateLimitError = null;
      return false;
    }

    return entry.data;
  }

  /**
   * Caches rate limit error state with 5-minute TTL
   */
  setRateLimitError(): void {
    this.cache.rateLimitError = {
      data: true,
      timestamp: Date.now(),
      ttl: ERROR_CACHE_TTL,
    };
  }

  /**
   * Clears rate limit error cache
   */
  clearRateLimitErrorCache(): void {
    this.cache.rateLimitError = null;
  }

  // ========================================
  // General Cache Methods
  // ========================================

  /**
   * Clears all cache entries
   */
  clearAll(): void {
    this.cache = {
      repositories: null,
      commits: {},
      rateLimitError: null,
    };
  }

  /**
   * Gets cache statistics for debugging
   * 
   * @returns Object with cache statistics
   */
  getStats(): {
    repositoriesCached: boolean;
    commitCacheCount: number;
    rateLimitErrorCached: boolean;
    cacheMemoryUsage: number;
  } {
    const now = Date.now();
    
    // Count valid commit cache entries
    let validCommitCount = 0;
    for (const [key, entry] of Object.entries(this.cache.commits)) {
      if (now - entry.timestamp <= entry.ttl) {
        validCommitCount++;
      }
    }

    return {
      repositoriesCached: this.cache.repositories !== null,
      commitCacheCount: validCommitCount,
      rateLimitErrorCached: this.cache.rateLimitError !== null,
      cacheMemoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Estimates cache memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    const now = Date.now();
    let bytes = 0;

    // Repository cache
    if (this.cache.repositories) {
      bytes += JSON.stringify(this.cache.repositories).length * 2;
    }

    // Commit cache
    for (const [key, entry] of Object.entries(this.cache.commits)) {
      if (now - entry.timestamp <= entry.ttl) {
        bytes += key.length * 2 + JSON.stringify(entry).length * 2;
      }
    }

    // Rate limit error cache
    if (this.cache.rateLimitError) {
      bytes += JSON.stringify(this.cache.rateLimitError).length * 2;
    }

    return bytes;
  }

  /**
   * Checks if a repository's commit cache is valid and not expired
   * 
   * @param repoName - Repository name
   * @returns true if cache exists and is valid
   */
  isCommitCacheValid(repoName: string): boolean {
    const entry = this.cache.commits[repoName];
    if (!entry) return false;

    const now = Date.now();
    return now - entry.timestamp <= entry.ttl;
  }

  /**
   * Checks if repositories cache is valid and not expired
   * 
   * @returns true if cache exists and is valid
   */
  isRepositoryCacheValid(): boolean {
    const entry = this.cache.repositories;
    if (!entry) return false;

    const now = Date.now();
    return now - entry.timestamp <= entry.ttl;
  }

  /**
   * Gets time remaining until repository cache expires (in seconds)
   * 
   * @returns Seconds until expiration, or 0 if not cached/expired
   */
  getRepositoryCacheTimeRemaining(): number {
    const entry = this.cache.repositories;
    if (!entry) return 0;

    const now = Date.now();
    const remaining = entry.ttl - (now - entry.timestamp);
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /**
   * Gets time remaining until commit cache for a repository expires (in seconds)
   * 
   * @param repoName - Repository name
   * @returns Seconds until expiration, or 0 if not cached/expired
   */
  getCommitCacheTimeRemaining(repoName: string): number {
    const entry = this.cache.commits[repoName];
    if (!entry) return 0;

    const now = Date.now();
    const remaining = entry.ttl - (now - entry.timestamp);
    return Math.max(0, Math.ceil(remaining / 1000));
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Singleton cache service instance
 */
let cacheServiceInstance: CacheService | null = null;

/**
 * Gets or creates the singleton CacheService instance
 * 
 * @returns CacheService instance
 */
export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

/**
 * Resets the cache service instance (useful for testing)
 */
export function resetCacheService(): void {
  cacheServiceInstance = null;
}

export {
  REPO_CACHE_TTL,
  COMMIT_CACHE_TTL,
  ERROR_CACHE_TTL,
};

export type { CacheEntry, CacheState };

export { CacheService };
export default CacheService;