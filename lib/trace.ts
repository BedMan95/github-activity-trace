/**
 * Trace ID management for logging correlation
 * 
 * Provides trace ID generation and retrieval for request tracking
 * across logs, errors, and API responses.
 * 
 * @file trace.ts
 */

/**
 * Header name for request trace ID
 */
export const TRACE_ID_HEADER = 'x-request-id';

/**
 * Environment variable name for trace ID prefix
 */
export const TRACE_ID_PREFIX_ENV = 'TRACE_ID_PREFIX';

/**
 * Interface for trace context
 */
export interface TraceContext {
  traceId: string;
  timestamp: string;
  prefix?: string;
}

/**
 * Generate a unique trace ID
 * 
 * @returns {string} UUID v4 trace ID
 */
export function generateTraceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for older Node.js versions
  return 'xxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Extract trace ID from request headers
 * 
 * @param {HeadersInit} headers - Request headers
 * @returns {string} Trace ID from header or newly generated one
 */
export function getTraceIdFromHeaders(headers: HeadersInit): string {
  const headerEntries = Array.from(Object.entries(headers));
  const traceIdHeader = headerEntries.find(([key]) => 
    key.toLowerCase() === TRACE_ID_HEADER.toLowerCase()
  );
  
  if (traceIdHeader && traceIdHeader[1]) {
    return String(traceIdHeader[1]);
  }
  
  return generateTraceId();
}

/**
 * Create a trace context for logging
 * 
 * @param {HeadersInit} headers - Request headers
 * @returns {TraceContext} Trace context with ID and timestamp
 */
export function createTraceContext(headers: HeadersInit = {}): TraceContext {
  return {
    traceId: getTraceIdFromHeaders(headers),
    timestamp: new Date().toISOString(),
    prefix: process.env[TRACE_ID_PREFIX_ENV],
  };
}

/**
 * Format log message with trace ID prefix
 * 
 * @param {string} message - Log message
 * @param {TraceContext} context - Trace context
 * @returns {string} Formatted log message
 */
export function formatLogMessage(message: string, context: TraceContext): string {
  const prefix = context.prefix ? `[${context.prefix}]` : '';
  return `${prefix}[${context.traceId}] ${message}`;
}

/**
 * Log with trace ID context (server-side only)
 * 
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {TraceContext} context - Trace context
 */
export function logWithTraceId(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: TraceContext
): void {
  const timestamp = new Date().toISOString();
  const formattedMessage = formatLogMessage(message, context);
  const logEntry = `${timestamp} [${level.toUpperCase()}] ${formattedMessage}`;
  
  switch (level) {
    case 'debug':
      console.debug(logEntry);
      break;
    case 'warn':
      console.warn(logEntry);
      break;
    case 'error':
      console.error(logEntry);
      break;
    default:
      console.info(logEntry);
  }
}
