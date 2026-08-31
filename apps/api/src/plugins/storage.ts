import { resolve } from 'node:path'

import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { createLocalDriver } from '../storage/local-driver.js'
import { createS3Driver } from '../storage/s3-driver.js'
import { createStorageService, type StorageService } from '../storage/storage.service.js'
import type { StorageDriver } from '../storage/types.js'

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageService
  }
}

async function storagePlugin(app: FastifyInstance): Promise<void> {
  const cfg = app.config
  const localRoot = resolve(process.cwd(), cfg.STORAGE_LOCAL_PATH)
  const local = createLocalDriver(localRoot)

  let primary: StorageDriver = local
  let fallback: StorageDriver | undefined

  if (cfg.STORAGE_DRIVER === 's3') {
    if (!cfg.S3_ENDPOINT || !cfg.S3_ACCESS_KEY || !cfg.S3_SECRET_KEY) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY. See .env.example.',
      )
    }
    primary = createS3Driver({
      endpoint: cfg.S3_ENDPOINT,
      region: cfg.S3_REGION,
      bucket: cfg.S3_BUCKET,
      accessKeyId: cfg.S3_ACCESS_KEY,
      secretAccessKey: cfg.S3_SECRET_KEY,
      forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    })
    // Local disk only acts as a fallback when it is not already the primary.
    fallback = local
  }

  // Probe at boot so a misconfigured bucket is visible immediately rather than
  // on a user's first upload. Not fatal: with a fallback configured the app is
  // still fully functional, just degraded.
  if (!(await primary.healthy())) {
    app.log.warn(
      { driver: primary.name, fallback: fallback?.name ?? 'none' },
      'primary storage is unreachable at boot',
    )
  }

  await app.register(multipart, {
    limits: {
      fileSize: cfg.MAX_UPLOAD_BYTES,
      files: 1,
      // Uploads are streamed against a hard cap rather than trusting an
      // attacker-supplied Content-Length. See docs/security.md §5.
      fieldSize: 1024,
    },
  })

  app.decorate(
    'storage',
    createStorageService({ primary, ...(fallback ? { fallback } : {}), log: app.log }),
  )
}

export default fp(storagePlugin, { name: 'storage', dependencies: ['config'] })
