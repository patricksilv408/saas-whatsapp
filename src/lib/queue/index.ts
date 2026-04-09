import { Queue } from 'bullmq'
import { MessageJobData } from '@/types'

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
}

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
  // Use jobId to deduplicate within debounce window
  await queue.add('process-message', data, {
    jobId,
    delay: delayMs,
  })
}

export { connection as redisConnection }
