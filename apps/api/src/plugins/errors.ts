import type { FastifyError, FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod'
import type { z } from 'zod'

import { AppError, type ErrorCode } from '../errors.js'

interface ErrorBody {
  error: {
    code: ErrorCode
    message: string
    details?: unknown
  }
}

function body(code: ErrorCode, message: string, details?: unknown): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } }
}

/**
 * One place where errors become HTTP responses.
 *
 * Internal details never reach the client in production: an unexpected error
 * is logged in full and answered with a generic 500. See docs/security.md §8.
 */
function errorsPlugin(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    void reply
      .status(404)
      .send(body('NOT_FOUND', `Route ${request.method} ${request.url} not found`))
  })

  // Explicitly typed: without the annotation TypeScript infers `unknown` for
  // the error once the type-guard narrowing below is applied.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Request failed schema validation.
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => {
        const zodIssue = issue.params.issue as z.core.$ZodIssue
        return { path: zodIssue.path.join('.'), message: zodIssue.message }
      })
      request.log.info({ details }, 'request validation failed')
      return reply.status(422).send(body('VALIDATION_ERROR', 'Request validation failed', details))
    }

    // We produced a response that does not match our own declared schema.
    // That is our bug, never the client's — 500, and loud in the logs.
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'response failed its own schema')
      return reply.status(500).send(body('INTERNAL_ERROR', 'Internal server error'))
    }

    if (error instanceof AppError) {
      request.log.info({ code: error.code, err: error }, 'domain error')
      return reply.status(error.statusCode).send(body(error.code, error.message, error.details))
    }

    // Fastify's own rate-limit and payload errors carry a statusCode.
    if (error.statusCode === 429) {
      return reply.status(429).send(body('RATE_LIMITED', 'Too many requests'))
    }
    if (typeof error.statusCode === 'number' && error.statusCode < 500) {
      return reply.status(error.statusCode).send(body('VALIDATION_ERROR', error.message))
    }

    request.log.error({ err: error }, 'unhandled error')
    return reply.status(500).send(body('INTERNAL_ERROR', 'Internal server error'))
  })
}

export default fp(errorsPlugin, { name: 'errors' })
