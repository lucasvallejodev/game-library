import type {
  GameDetail,
  GameList,
  GameType,
  Genre,
  IgdbGame,
  Location,
} from '@game-library/shared/schemas'

/**
 * The typed API client.
 *
 * Types come from `packages/shared`, the same Zod schemas the API validates
 * requests with — so a breaking payload change is a TypeScript error on both
 * sides in one commit. See docs/architecture.md §3.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /**
   * Server Components must forward the incoming cookie header explicitly —
   * there is no ambient browser to do it for them.
   */
  cookie?: string
  signal?: AbortSignal
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, cookie, signal } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie
  // The API checks Origin on state-changing requests (docs/security.md §2).
  if (method !== 'GET') headers.origin = getWebOrigin()

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    // Sessions are cookies, never bearer tokens.
    credentials: 'include',
    cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload: unknown = text ? JSON.parse(text) : null

  if (!response.ok) {
    const err = (payload as ApiErrorBody | null)?.error
    throw new ApiError(
      response.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? `Request failed with ${String(response.status)}`,
      err?.details,
    )
  }

  return payload as T
}

function getWebOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000'
}

/** Media is proxied by the API, which checks ownership before serving. */
export function mediaUrl(path: string | null): string | null {
  return path ? `${API_URL}${path}` : null
}

export const api = {
  games: {
    list: (query: string, opts?: RequestOptions) => apiFetch<GameList>(`/api/games${query}`, opts),
    get: (id: string, opts?: RequestOptions) => apiFetch<GameDetail>(`/api/games/${id}`, opts),
    create: (body: unknown, opts?: RequestOptions) =>
      apiFetch<GameDetail>('/api/games', { ...opts, method: 'POST', body }),
    update: (id: string, body: unknown, opts?: RequestOptions) =>
      apiFetch<GameDetail>(`/api/games/${id}`, { ...opts, method: 'PATCH', body }),
    remove: (id: string, opts?: RequestOptions) =>
      apiFetch<void>(`/api/games/${id}`, { ...opts, method: 'DELETE' }),
  },
  locations: {
    list: (opts?: RequestOptions) => apiFetch<{ data: Location[] }>('/api/locations', opts),
    create: (body: unknown, opts?: RequestOptions) =>
      apiFetch<Location>('/api/locations', { ...opts, method: 'POST', body }),
  },
  gameTypes: {
    list: (opts?: RequestOptions) => apiFetch<{ data: GameType[] }>('/api/game-types', opts),
  },
  genres: {
    list: (opts?: RequestOptions) => apiFetch<{ data: Genre[] }>('/api/genres', opts),
  },
  igdb: {
    search: (q: string, opts?: RequestOptions) =>
      apiFetch<{ data: IgdbGame[] }>(`/api/igdb/search?q=${encodeURIComponent(q)}`, opts),
  },
}
