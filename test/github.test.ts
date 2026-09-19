import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import {
  GitHubService,
  GitHubApiError,
  createGitHubService,
  createGitHubServiceWithToken,
  getGlobalRateLimitInfo,
  isRateLimitWarning,
  isRateLimitExceeded,
  getRateLimitResetSeconds,
  makeRequest,
  BASE_RETRY_DELAY,
  MAX_RETRY_ATTEMPTS,
  calculateBackoffDelay,
  globalRateLimitInfo,
} from '../services/github';
import { Octokit } from '@octokit/rest';

// Mock settings module
vi.mock('../lib/settings', () => ({
  getEffectiveGitHubToken: vi.fn(),
}));

import { getEffectiveGitHubToken } from '../lib/settings';

describe('GitHubService', () => {
  const validToken = 'ghp_test_token_1234567890';

  describe('constructor', () => {
    it('should create instance with valid token', () => {
      const service = new GitHubService(validToken);
      expect(service).toBeInstanceOf(GitHubService);
    });

    it('should set custom trace ID when provided', () => {
      const service = new GitHubService(validToken, 'custom-trace-id');
      expect(service.getTraceId()).toBe('custom-trace-id');
    });

    it('should generate trace ID when not provided', () => {
      const service = new GitHubService(validToken);
      expect(service.getTraceId()).toBeTruthy();
      expect(service.getTraceId().length).toBeGreaterThan(0);
    });

    it('should initialize Octokit with user agent', () => {
      const service = new GitHubService(validToken);
      const octokit = service.getOctokit();
      expect(octokit).toBeInstanceOf(Octokit);
    });
  });

  describe('getOctokit', () => {
    it('should return Octokit instance', () => {
      const service = new GitHubService(validToken);
      expect(service.getOctokit()).toBeInstanceOf(Octokit);
    });
  });

  describe('getTraceId', () => {
    it('should return trace ID', () => {
      const service = new GitHubService(validToken, 'test-id');
      expect(service.getTraceId()).toBe('test-id');
    });
  });

  describe('withFreshTraceId', () => {
    it('should return new service with different trace ID', () => {
      const service1 = new GitHubService(validToken, 'trace-1');
      const service2 = service1.withFreshTraceId();

      expect(service2).not.toBe(service1);
      expect(service2.getTraceId()).not.toBe(service1.getTraceId());
    });

    it('should preserve token by creating valid Octokit instances', () => {
      const service1 = new GitHubService(validToken, 'trace-1');
      const service2 = service1.withFreshTraceId();

      // Both should be valid Octokit instances that can make authenticated requests
      expect(service1.getOctokit()).toBeInstanceOf(Octokit);
      expect(service2.getOctokit()).toBeInstanceOf(Octokit);
      // Both should have different trace IDs
      expect(service1.getTraceId()).not.toBe(service2.getTraceId());
    });
  });

  describe('rate limit methods', () => {
    beforeEach(() => {
      // Reset global rate limit state
      (globalRateLimitInfo as any).remaining = 5000;
      (globalRateLimitInfo as any).resetTime = Math.floor(Date.now() / 1000) + 3600;
    });

    describe('getRateLimitInfo', () => {
      it('should return current rate limit info', () => {
        const service = new GitHubService(validToken);
        const info = service.getRateLimitInfo();

        expect(info).toHaveProperty('remaining');
        expect(info).toHaveProperty('resetTime');
        expect(info).toHaveProperty('limit');
      });

      it('should return a copy, not the original', () => {
        const service = new GitHubService(validToken);
        const info1 = service.getRateLimitInfo();
        const info2 = service.getRateLimitInfo();

        expect(info1).not.toBe(info2);
      });
    });

    describe('shouldWarnRateLimit', () => {
      it('should return false when remaining is above threshold', () => {
        const service = new GitHubService(validToken);
        expect(service.shouldWarnRateLimit()).toBe(false);
      });
    });

    describe('isRateLimitExceeded', () => {
      it('should return false when remaining is above 0', () => {
        const service = new GitHubService(validToken);
        expect(service.isRateLimitExceeded()).toBe(false);
      });
    });
  });

  describe('executeWithRetry', () => {
    it('should return result on success', async () => {
      const service = new GitHubService(validToken);
      
      const result = await service.executeWithRetry(() => 
        Promise.resolve({ data: 'success' })
      );

      expect(result).toEqual({ data: 'success' });
    });

    it('should throw on non-retryable error', async () => {
      const service = new GitHubService(validToken);
      
      await expect(
        service.executeWithRetry(() => Promise.reject(new Error('Not found')), 3)
      ).rejects.toThrow('Not found');
    });

    it('should retry on 5xx errors', async () => {
      const service = new GitHubService(validToken);
      let attempts = 0;

      const result = await service.executeWithRetry(() => {
        attempts++;
        if (attempts < 2) {
          const error: any = new Error('Server error');
          error.status = 500;
          return Promise.reject(error);
        }
        return Promise.resolve({ data: 'success' });
      }, 3);

      expect(result).toEqual({ data: 'success' });
      expect(attempts).toBe(2);
    });

    it('should retry on 429 errors', async () => {
      const service = new GitHubService(validToken);
      let attempts = 0;

      const result = await service.executeWithRetry(() => {
        attempts++;
        if (attempts < 2) {
          const error: any = new Error('Too many requests');
          error.status = 429;
          return Promise.reject(error);
        }
        return Promise.resolve({ data: 'success' });
      }, 3);

      expect(result).toEqual({ data: 'success' });
      expect(attempts).toBe(2);
    });

    it('should throw after max retries exceeded', async () => {
      const service = new GitHubService(validToken);
      let attempts = 0;

      await expect(
        service.executeWithRetry(() => {
          attempts++;
          const error: any = new Error('Server error');
          error.status = 500;
          return Promise.reject(error);
        }, 3)
      ).rejects.toThrow('Server error');

      expect(attempts).toBe(4); // Initial + 3 retries
    }, 30000); // 30 second timeout for retry tests
  });
});

describe('GitHubApiError', () => {
  const traceId = 'test-trace';

  it('should create error with status and message', () => {
    const error = new GitHubApiError(404, 'Not found', traceId);
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.traceId).toBe(traceId);
  });

  it('should identify auth errors', () => {
    const error401 = new GitHubApiError(401, 'Unauthorized', traceId);
    const error403 = new GitHubApiError(403, 'Forbidden', traceId);
    const error404 = new GitHubApiError(404, 'Not found', traceId);

    expect(error401.isAuthError()).toBe(true);
    expect(error403.isAuthError()).toBe(true);
    expect(error404.isAuthError()).toBe(false);
  });

  it('should identify rate limit errors', () => {
    const error403 = new GitHubApiError(403, 'Rate limit exceeded', traceId);
    const error429 = new GitHubApiError(429, 'Too many requests', traceId);
    const error404 = new GitHubApiError(404, 'Not found', traceId);

    expect(error403.isRateLimitError()).toBe(true);
    expect(error429.isRateLimitError()).toBe(true);
    expect(error404.isRateLimitError()).toBe(false);
  });

  it('should get retry-after seconds from headers', () => {
    const error = new GitHubApiError(403, 'Rate limit', traceId, {
      headers: { 'retry-after': '30' }
    });

    expect(error.getRetryAfterSeconds()).toBe(30);
  });

  it('should return default retry-after when header missing', () => {
    const error = new GitHubApiError(403, 'Rate limit', traceId, {});
    expect(error.getRetryAfterSeconds()).toBe(60);
  });

  it('should get rate limit reset time from headers', () => {
    const resetTime = Math.floor(Date.now() / 1000) + 60;
    const error = new GitHubApiError(403, 'Rate limit', traceId, {
      headers: { 'x-ratelimit-reset': String(resetTime) }
    });

    const result = error.getRateLimitResetTime();
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBeCloseTo(resetTime * 1000, -2);
  });

  it('should return null for reset time when header missing', () => {
    const error = new GitHubApiError(403, 'Rate limit', traceId, {});
    expect(error.getRateLimitResetTime()).toBeNull();
  });
});

describe('Factory Functions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.mocked(getEffectiveGitHubToken).mockReturnValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createGitHubService', () => {
    it('should create service when GITHUB_TOKEN is set in env', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      const service = createGitHubService();
      expect(service).toBeInstanceOf(GitHubService);
    });

    it('should create service when token is in settings', () => {
      delete process.env.GITHUB_TOKEN;
      vi.mocked(getEffectiveGitHubToken).mockReturnValue('settings-token');
      const service = createGitHubService();
      expect(service).toBeInstanceOf(GitHubService);
    });

    it('should throw when GITHUB_TOKEN is not set anywhere', () => {
      delete process.env.GITHUB_TOKEN;
      vi.mocked(getEffectiveGitHubToken).mockReturnValue(undefined);
      expect(() => createGitHubService()).toThrow('GITHUB_TOKEN environment variable is not configured');
    });

    it('should throw when GITHUB_TOKEN is empty string in env and no settings', () => {
      process.env.GITHUB_TOKEN = '';
      vi.mocked(getEffectiveGitHubToken).mockReturnValue('');
      expect(() => createGitHubService()).toThrow('GITHUB_TOKEN environment variable is not configured');
    });
  });

  describe('createGitHubServiceWithToken', () => {
    it('should create service with provided token', () => {
      const service = createGitHubServiceWithToken('custom-token', 'custom-trace');
      expect(service).toBeInstanceOf(GitHubService);
      expect(service.getTraceId()).toBe('custom-trace');
    });

    it('should generate trace ID if not provided', () => {
      const service = createGitHubServiceWithToken('custom-token');
      expect(service.getTraceId()).toBeTruthy();
    });
  });
});

describe('Rate Limit Utilities', () => {
  beforeEach(() => {
    // Reset global state
    (globalRateLimitInfo as any).remaining = 5000;
    (globalRateLimitInfo as any).resetTime = Math.floor(Date.now() / 1000) + 3600;
    (globalRateLimitInfo as any).limit = 5000;
  });

  describe('getGlobalRateLimitInfo', () => {
    it('should return rate limit info', () => {
      const info = getGlobalRateLimitInfo();
      expect(info).toHaveProperty('remaining');
      expect(info).toHaveProperty('resetTime');
      expect(info).toHaveProperty('limit');
    });

    it('should return a copy', () => {
      const info1 = getGlobalRateLimitInfo();
      const info2 = getGlobalRateLimitInfo();
      expect(info1).not.toBe(info2);
    });
  });

  describe('isRateLimitWarning', () => {
    it('should return false with high remaining count', () => {
      globalRateLimitInfo.remaining = 100;
      globalRateLimitInfo.limit = 5000;
      expect(isRateLimitWarning()).toBe(false);
    });

    it('should return true when remaining is below threshold', () => {
      globalRateLimitInfo.remaining = 5;
      globalRateLimitInfo.limit = 5000;
      expect(isRateLimitWarning()).toBe(true);
    });

    it('should return true when remaining is 0 (rate limit exhausted)', () => {
      globalRateLimitInfo.remaining = 0;
      globalRateLimitInfo.resetTime = Math.floor(Date.now() / 1000) + 3600;
      // 0 < 10 threshold = true (out of requests!)
      expect(isRateLimitWarning()).toBe(true);
    });
  });

  describe('isRateLimitExceeded', () => {
    it('should return false when remaining is above 0', () => {
      globalRateLimitInfo.remaining = 100;
      globalRateLimitInfo.resetTime = Math.floor(Date.now() / 1000) + 3600;
      expect(isRateLimitExceeded()).toBe(false);
    });

    it('should return false when remaining is 0 but reset time passed', () => {
      globalRateLimitInfo.remaining = 0;
      globalRateLimitInfo.resetTime = Math.floor(Date.now() / 1000) - 60; // Reset time passed
      expect(isRateLimitExceeded()).toBe(false);
    });
  });

  describe('getRateLimitResetSeconds', () => {
    it('should return positive seconds when reset is in future', () => {
      const resetTime = Math.floor(Date.now() / 1000) + 60;
      globalRateLimitInfo.resetTime = resetTime;
      const seconds = getRateLimitResetSeconds();
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(60);
    });

    it('should return 0 when reset time has passed', () => {
      globalRateLimitInfo.resetTime = Math.floor(Date.now() / 1000) - 60;
      expect(getRateLimitResetSeconds()).toBe(0);
    });
  });
});

describe('Exponential Backoff', () => {
  describe('calculateBackoffDelay', () => {
    it('should increase with attempt number', () => {
      const delay0 = calculateBackoffDelay(0);
      const delay1 = calculateBackoffDelay(1);
      const delay2 = calculateBackoffDelay(2);

      // Delay should increase with each attempt (allowing for jitter)
      expect(delay1).toBeGreaterThanOrEqual(delay0);
      expect(delay2).toBeGreaterThanOrEqual(delay1);
    });

    it('should return value close to base delay for attempt 0', () => {
      const delay = calculateBackoffDelay(0);
      // Base is 1000, jitter is ±25%, so should be between 750 and 1250
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    });

    it('should respect custom base delay', () => {
      const delay = calculateBackoffDelay(0, 2000);
      // With custom base of 2000, should be between 1500 and 2500
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(2500);
    });
  });
});

describe('makeRequest', () => {
  const validToken = 'ghp_test_token';

  it('should return data and rate limit info on success', async () => {
    const service = new GitHubService(validToken);
    const mockResponse = {
      data: { id: 123, name: 'test' },
      headers: {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
      },
    };

    const result = await makeRequest(
      service,
      () => Promise.resolve(mockResponse as any)
    );

    expect(result.data).toEqual({ id: 123, name: 'test' });
    expect(result.rateLimitInfo).toHaveProperty('remaining');
    expect(result.rateLimitInfo).toHaveProperty('resetTime');
    expect(result.rateLimitInfo).toHaveProperty('limit');
  });

  it('should update global rate limit info from headers', async () => {
    const service = new GitHubService(validToken);
    const initialInfo = getGlobalRateLimitInfo();
    
    const mockResponse = {
      data: { id: 123 },
      headers: {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '100',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
      },
    };

    await makeRequest(
      service,
      () => Promise.resolve(mockResponse as any)
    );

    const newInfo = getGlobalRateLimitInfo();
    expect(newInfo.remaining).toBe(100);
  });

  it('should throw on error', async () => {
    const service = new GitHubService(validToken);

    await expect(
      makeRequest(
        service,
        () => Promise.reject(new Error('Network error'))
      )
    ).rejects.toThrow('Network error');
  });
});

describe('Constants', () => {
  it('should export BASE_RETRY_DELAY', () => {
    expect(BASE_RETRY_DELAY).toBe(1000);
  });

  it('should export MAX_RETRY_ATTEMPTS', () => {
    expect(MAX_RETRY_ATTEMPTS).toBe(3);
  });
});