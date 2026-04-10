import 'dotenv/config'
import { Worker } from 'bullmq'
import { processMessage } from './processors/message.processor'

// Parse REDIS_URL or fall back to individual vars
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

console.log('🚀 WhatsApp SaaS Worker starting...')
console.log(`📡 Redis: ${connection.host}:${connection.port}`)

const worker = new Worker(
  'message-processing',
  async (job) => {
    console.log(`📨 Processing job ${job.id} for agent ${job.data.agentId}`)
    await processMessage(job.data)
    console.log(`✅ Job ${job.id} completed`)
  },
  {
    connection,
    concurrency: 10,
    limiter: {
      max: 50,
      duration: 1000,
    },
  }
)

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message)
})

worker.on('error', (err) => {
  console.error('Worker error:', err)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...')
  await worker.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing worker...')
  await worker.close()
  process.exit(0)
})

console.log('✅ Worker started and listening for jobs...')
