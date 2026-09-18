import { describe, it, expect } from "vitest";
import { formatDate, truncateMessage, formatCommit, formatCommits } from "../types/formatting";

describe("formatDate", () => {
  it("should format ISO 8601 date to YYYY-MM-DD", () => {
    expect(formatDate("2024-01-15T10:30:00Z")).toBe("2024-01-15");
    expect(formatDate("2023-12-31T23:59:59Z")).toBe("2023-12-31");
  });

  it("should handle invalid dates", () => {
    expect(formatDate("invalid-date")).toBe("Invalid Date");
    expect(formatDate("")).toBe("Invalid Date");
  });
});

describe("truncateMessage", () => {
  it("should return message unchanged if within length", () => {
    expect(truncateMessage("Short message")).toBe("Short message");
  });

  it("should truncate message with ellipsis", () => {
    const longMessage = "This is a very long commit message that exceeds the default 100 character limit and should be truncated with an ellipsis at the end";
    const truncated = truncateMessage(longMessage);
    expect(truncated.length).toBe(103); // 100 + "..."
    expect(truncated).toMatch(/\.\.\.$/);
  });

  it("should respect custom max length", () => {
    const message = "This is a test message";
    // "This is a " is exactly 10 characters, so it should be truncated at 10
    expect(truncateMessage(message, 10)).toBe("This is a ...");
  });
});

describe("formatCommit", () => {
  it("should add formattedDate and truncatedMessage", () => {
    const commit = {
      id: "abc123",
      repository: "my-repo",
      message: "This is a commit message",
      date: "2024-01-15T10:30:00Z",
      author: "user",
      sha: "a1b2c3d4e5f6",
      url: "https://github.com/user/my-repo/commit/abc123"
    };
    const formatted = formatCommit(commit);
    expect(formatted.formattedDate).toBe("2024-01-15");
    expect(formatted.truncatedMessage).toBe("This is a commit message");
  });
});

describe("formatCommits", () => {
  it("should format an array of commits", () => {
    const commits = [
      {
        id: "abc123",
        repository: "repo1",
        message: "First commit",
        date: "2024-01-15T10:30:00Z",
        author: "user",
        sha: "a1b2c3d4e5f6",
        url: "https://github.com/user/repo1/commit/abc123"
      },
      {
        id: "def456",
        repository: "repo2",
        message: "Second commit with a very long message that should be truncated",
        date: "2024-01-16T11:45:00Z",
        author: "user",
        sha: "b2c3d4e5f6g7",
        url: "https://github.com/user/repo2/commit/def456"
      }
    ];
    const formatted = formatCommits(commits);
    expect(formatted.length).toBe(2);
    expect(formatted[0].formattedDate).toBe("2024-01-15");
    // The message "Second commit with a very long message that should be truncated" is 63 chars
    expect(formatted[1].truncatedMessage.length).toBe(63);
  });
});
