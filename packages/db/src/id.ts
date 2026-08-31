import { v7 as uuidv7 } from 'uuid'

/**
 * Primary keys are UUIDv7, generated application-side.
 *
 * v7 over v4 because v7 embeds a millisecond timestamp in its high bits, so
 * generated ids sort roughly by creation time. That gives B-tree index locality
 * close to a serial's — new rows land at the right edge of the index instead of
 * scattering random dirty pages — while staying non-enumerable in URLs.
 *
 * Generated here rather than by Postgres because `uuidv7()` is only built in
 * from Postgres 18 and we target 16. See docs/database.md §1.
 */
export function newId(): string {
  return uuidv7()
}
