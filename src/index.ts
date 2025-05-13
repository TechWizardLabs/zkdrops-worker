import { Job, Worker } from 'bullmq';
import "dotenv/config";
import { redis } from './db/redis';

// ==================
// 🔧 Queue Constants
// ==================
const REDIS_QUEUE_NAME = process.env.REDIS_QUEUE_NAME || 'mintQueue';

// ========================
// 🛠️ Worker Initialization
// ========================
const mintWorker = new Worker(
  REDIS_QUEUE_NAME,
  async (job: Job) => {
    console.log(`📥 [WebhookWorker] Received Job ${job.id}`);
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

// ====================
// 🧠 Worker Event Logs
// ====================
function bindWorkerEvents(name: string, worker: Worker) {
  worker.on("ready", () => {
    console.log(`🚀 [${name}] Worker ready`);
  });

  worker.on("ioredis:close", () => {
    console.warn(`⚠️ [${name}] Redis connection closed`);
  });

  worker.on("completed", (job) => {
    console.log(`✅ [${name}] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ [${name}] Job ${job?.id} failed with error:`, err);
  });

  worker.on("progress", (job, progress) => {
    console.log(`📊 [${name}] Job ${job.id} progress:`, progress);
  });
}

bindWorkerEvents("mintWorker", mintWorker);

// ====================
// 🧪 Redis Event Logs
// ====================
redis.on("connect", () => console.log("🔌 Redis connected"));
redis.on("ready", () => console.log("🚀 Redis ready"));
redis.on("error", (err: Error) => console.error("🔥 Redis error:", err));
redis.on("close", () => console.warn("🔒 Redis connection closed"));
redis.on("reconnecting", () => console.info("♻️ Redis reconnecting..."));

// ============================
// 🫀 Health Checks and Pingers
// ============================
setInterval(async () => {
  try {
    await redis.ping();
    console.log(`[${new Date().toISOString()}] 🔄 Redis ping`);
  } catch (err) {
    console.error("❗ Redis ping failed:", err);
  }
}, 60_000);

setInterval(() => {
  console.log(`[${new Date().toISOString()}] ❤️ Worker heartbeat`);
}, 5 * 60_000);