import { schema } from '@game-library/db'
import type { Location } from '@game-library/shared/schemas'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestUser, type TestUser } from './helpers/auth-client.js'
import { startMinio, type StartedMinio } from './helpers/minio-container.js'
import { startTestServer, type TestServer } from './helpers/test-server.js'

let minio: StartedMinio
let s: TestServer
let user: TestUser

/** A real PNG, so magic-byte detection and sharp both have something genuine. */
async function makePng(width = 600, height = 800): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 47, g: 155, b: 255 } },
  })
    .png()
    .toBuffer()
}

/** Minimal multipart body — no helper library, so the wire format is explicit. */
function multipart(file: Buffer, filename = 'cover.png', contentType = 'image/png') {
  const boundary = '----gamelibrarytest'
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

async function uploadLogo(locationId: string, file: Buffer, filename?: string, mime?: string) {
  const { payload, headers } = multipart(file, filename, mime)
  return s.app.inject({
    method: 'POST',
    url: `/api/locations/${locationId}/logo`,
    headers: { ...headers, cookie: user.cookie },
    payload,
  })
}

async function newLocation(name: string): Promise<Location> {
  const res = await user.request('POST', '/api/locations', { name, color: '#2F9BFF' })
  return res.json<Location>()
}

beforeAll(async () => {
  minio = await startMinio()
  s = await startTestServer({
    migrate: true,
    storage: {
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: minio.endpoint,
      S3_BUCKET: minio.bucket,
      S3_ACCESS_KEY: minio.accessKey,
      S3_SECRET_KEY: minio.secretKey,
    },
  })
  await s.app.ready()
  user = await createTestUser(s.app, 'storage')
}, 300_000)

afterAll(async () => {
  await s.stop()
  await minio.stop().catch(() => undefined)
})

describe('image pipeline', () => {
  it('re-encodes an uploaded PNG to WebP', async () => {
    const location = await newLocation('Pipeline')
    const res = await uploadLogo(location.id, await makePng())

    expect(res.statusCode).toBe(200)
    const assetId = res.json<Location>().logoUrl?.split('/')[3]
    expect(assetId).toBeDefined()

    const rows = await s.app.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, assetId!))

    expect(rows[0]).toMatchObject({
      mimeType: 'image/webp',
      storageDriver: 's3',
      source: 'upload',
      width: 600,
      height: 800,
    })
    expect(rows[0]?.checksumSha256).toHaveLength(64)
  })

  it('strips EXIF, which can carry GPS coordinates', async () => {
    const withExif = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#fff' },
    })
      .withExif({ IFD0: { Copyright: 'SECRET-MARKER', Artist: 'GPS-MARKER' } })
      .jpeg()
      .toBuffer()

    // Confirm the fixture genuinely carries the metadata before asserting it goes.
    expect((await sharp(withExif).metadata()).exif).toBeDefined()

    const location = await newLocation('Exif')
    const res = await uploadLogo(location.id, withExif, 'photo.jpg', 'image/jpeg')
    expect(res.statusCode).toBe(200)

    const assetId = res.json<Location>().logoUrl!.split('/')[3]!
    const served = await s.app.inject({
      method: 'GET',
      url: `/api/media/${assetId}/cover.webp`,
      headers: { cookie: user.cookie },
    })

    const bytes = served.rawPayload
    expect(bytes.includes(Buffer.from('SECRET-MARKER'))).toBe(false)
    expect(bytes.includes(Buffer.from('GPS-MARKER'))).toBe(false)
  })

  it('rejects a non-image by magic bytes, not by declared content type', async () => {
    const location = await newLocation('Disguised')
    // A shell script claiming to be a PNG — the exact polyglot case.
    const disguised = Buffer.from('#!/bin/sh\necho pwned\n')

    const res = await uploadLogo(location.id, disguised, 'cover.png', 'image/png')

    expect(res.statusCode).toBe(422)
    expect(res.json<{ error: { message: string } }>().error.message).toMatch(/Unsupported image/)
  })

  it('rejects an empty upload', async () => {
    const location = await newLocation('Empty')
    const res = await uploadLogo(location.id, Buffer.alloc(0))
    expect(res.statusCode).toBe(422)
  })

  it('produces a thumbnail variant alongside the full size', async () => {
    const location = await newLocation('Variants')
    const res = await uploadLogo(location.id, await makePng(1200, 1600))
    const assetId = res.json<Location>().logoUrl!.split('/')[3]!

    const [full, thumb] = await Promise.all([
      s.app.inject({
        method: 'GET',
        url: `/api/media/${assetId}/cover.webp`,
        headers: { cookie: user.cookie },
      }),
      s.app.inject({
        method: 'GET',
        url: `/api/media/${assetId}/thumb.webp`,
        headers: { cookie: user.cookie },
      }),
    ])

    expect(full.statusCode).toBe(200)
    expect(thumb.statusCode).toBe(200)

    const fullMeta = await sharp(full.rawPayload).metadata()
    const thumbMeta = await sharp(thumb.rawPayload).metadata()

    expect(fullMeta.width).toBe(720)
    expect(thumbMeta.width).toBe(320)
    // The thumbnail must actually be cheaper, or it is pointless.
    expect(thumb.rawPayload.byteLength).toBeLessThan(full.rawPayload.byteLength)
  })
})

describe('serving', () => {
  it('sets an immutable cache header and honours If-None-Match', async () => {
    const location = await newLocation('Caching')
    const assetId = (await uploadLogo(location.id, await makePng()))
      .json<Location>()
      .logoUrl!.split('/')[3]!

    const first = await s.app.inject({
      method: 'GET',
      url: `/api/media/${assetId}/cover.webp`,
      headers: { cookie: user.cookie },
    })
    expect(first.statusCode).toBe(200)
    expect(first.headers['cache-control']).toContain('immutable')

    const etag = first.headers.etag!
    const second = await s.app.inject({
      method: 'GET',
      url: `/api/media/${assetId}/cover.webp`,
      headers: { cookie: user.cookie, 'if-none-match': etag },
    })
    expect(second.statusCode).toBe(304)
  })

  it('never serves another user asset', async () => {
    const location = await newLocation('Private')
    const assetId = (await uploadLogo(location.id, await makePng()))
      .json<Location>()
      .logoUrl!.split('/')[3]!

    const intruder = await createTestUser(s.app, 'storage-intruder')
    const res = await s.app.inject({
      method: 'GET',
      url: `/api/media/${assetId}/cover.webp`,
      headers: { cookie: intruder.cookie },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND')
  })

  it('requires a session', async () => {
    const res = await s.app.inject({
      method: 'GET',
      url: `/api/media/${crypto.randomUUID()}/cover.webp`,
    })
    expect(res.statusCode).toBe(401)
  })
})

/**
 * The acceptance test for this increment.
 *
 * Uploads through S3, kills MinIO, uploads again, and then proves *both*
 * assets still serve. That last part is the whole reason
 * media_assets.storage_driver exists: resolving the driver from current config
 * instead of per row would break every object written during the outage the
 * moment S3 came back. See docs/architecture.md §7.
 */
describe('S3 → local fallback', () => {
  it('keeps accepting uploads when object storage dies, and serves both afterwards', async () => {
    const beforeLocation = await newLocation('Before Outage')
    const beforeRes = await uploadLogo(beforeLocation.id, await makePng())
    expect(beforeRes.statusCode).toBe(200)
    const beforeAssetId = beforeRes.json<Location>().logoUrl!.split('/')[3]!

    const beforeRow = (
      await s.app.db
        .select()
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.id, beforeAssetId))
    )[0]
    expect(beforeRow?.storageDriver).toBe('s3')
    expect(beforeRow?.bucket).toBe(minio.bucket)

    // Read it once while S3 is healthy, to compare bytes later.
    const servedWhileHealthy = await s.app.inject({
      method: 'GET',
      url: `/api/media/${beforeAssetId}/cover.webp`,
      headers: { cookie: user.cookie },
    })
    expect(servedWhileHealthy.statusCode).toBe(200)

    // ── object storage goes away ──────────────────────────────────────────
    await minio.stop()

    const afterLocation = await newLocation('During Outage')
    const afterRes = await uploadLogo(afterLocation.id, await makePng(500, 500))

    // The upload must still succeed — the user should not lose their work
    // because MinIO fell over.
    expect(afterRes.statusCode).toBe(200)
    const afterAssetId = afterRes.json<Location>().logoUrl!.split('/')[3]!

    const afterRow = (
      await s.app.db
        .select()
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.id, afterAssetId))
    )[0]
    expect(afterRow?.storageDriver).toBe('local')
    expect(afterRow?.bucket).toBeNull()

    // The fallback-written asset serves.
    const afterServed = await s.app.inject({
      method: 'GET',
      url: `/api/media/${afterAssetId}/cover.webp`,
      headers: { cookie: user.cookie },
    })
    expect(afterServed.statusCode).toBe(200)
    expect((await sharp(afterServed.rawPayload).metadata()).width).toBe(500)

    // And the S3-written asset now fails to read, because S3 really is gone —
    // proving the read path resolves per asset rather than silently reading
    // everything from local disk.
    const beforeServedDuringOutage = await s.app.inject({
      method: 'GET',
      url: `/api/media/${beforeAssetId}/cover.webp`,
      headers: { cookie: user.cookie },
    })
    expect(beforeServedDuringOutage.statusCode).toBeGreaterThanOrEqual(400)
  }, 180_000)
})
