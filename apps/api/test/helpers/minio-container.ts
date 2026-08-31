import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'

export interface StartedMinio {
  container: StartedTestContainer
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  /** Kill the container so the S3 driver starts failing — the fallback test. */
  stop: () => Promise<void>
}

const ACCESS_KEY = 'testaccess'
const SECRET_KEY = 'testsecret123'
const BUCKET = 'test-media'

/**
 * A real MinIO, pinned to the same release as docker-compose.yml.
 *
 * Deliberately not a mock: the whole point of this suite is what happens when
 * object storage genuinely goes away mid-flight, which a stub cannot reproduce
 * faithfully.
 */
export async function startMinio(): Promise<StartedMinio> {
  const container = await new GenericContainer('minio/minio:RELEASE.2025-09-07T16-13-09Z')
    .withEnvironment({ MINIO_ROOT_USER: ACCESS_KEY, MINIO_ROOT_PASSWORD: SECRET_KEY })
    .withCommand(['server', '/data'])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000).forStatusCode(200))
    .start()

  const endpoint = `http://${container.getHost()}:${String(container.getMappedPort(9000))}`

  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  })
  await client.send(new CreateBucketCommand({ Bucket: BUCKET }))
  client.destroy()

  return {
    container,
    endpoint,
    bucket: BUCKET,
    accessKey: ACCESS_KEY,
    secretKey: SECRET_KEY,
    stop: async () => {
      await container.stop()
    },
  }
}
