import { Queue } from 'bullmq'
import { MessageJobData } from '@/types'

// Parse REDIS_URL or fall back to individual vars (same as worker/index.ts)
function getRedisConnection() {
  const url = process.env.REDIS_URL
  if (url) {
    const parsed = new URL(url)
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379'),
      password: parsed.password || undefined,
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  }
}

const connection = getRedisConnection()

let messageQueue: Queue | null = null

export function getMessageQueue(): Queue {
  if (!messageQueue) {
    messageQueue = new Queue<MessageJobData>('message-processing', {
      connection,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    })
  }
  return messageQueue
}

export async function enqueueMessage(
  jobId: string,
  data: MessageJobData,
  delayMs: number
) {
  const queue = getMessageQueue()
  await queue.add('process-message', data, {
    jobId,
    delay: delayMs,
  })
}

export { connection as redisConnection }
