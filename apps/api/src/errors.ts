/**
 * Domain errors.
 *
 * Services throw these; one central handler maps them to HTTP. Keeping the
 * mapping in a single place is what lets services stay free of req/res
 * concerns. See docs/architecture.md §5.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR'

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode
  abstract readonly statusCode: number
  /** Extra context safe to return to the client. */
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.details = details
  }
}

/**
 * Returned when a resource does not exist **or** belongs to another user.
 * Never distinguish the two: a 403 confirms the resource exists.
 * See docs/security.md §3.
 */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND' as const
  readonly statusCode = 404

  constructor(resource = 'Resource') {
    super(`${resource} not found`)
  }
}

export class ConflictError extends AppError {
  readonly code = 'CONFLICT' as const
  readonly statusCode = 409
}

export class UnauthenticatedError extends AppError {
  readonly code = 'UNAUTHENTICATED' as const
  readonly statusCode = 401

  constructor(message = 'Authentication required') {
    super(message)
  }
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR' as const
  readonly statusCode = 422
}

/** An upstream we do not control failed — IGDB, Twitch, object storage. */
export class ExternalServiceError extends AppError {
  readonly code = 'EXTERNAL_SERVICE_ERROR' as const
  readonly statusCode = 502

  constructor(service: string, message?: string) {
    super(message ?? `${service} is unavailable`)
  }
}
