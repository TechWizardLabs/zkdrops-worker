import { Job, Worker } from 'bullmq';
import "dotenv/config";
import { redis } from './db/redis';
import { mintNFT, prepareNFTs } from './lib/mint';
import prisma from './db/prisma';

// ==================
// 🔧 Queue Constants
// ==================
const REDIS_PREPARE_QUEUE_NAME = process.env.REDIS_PREPARE_QUEUE_NAME || 'prepareQueue';
const REDIS_MINT_QUEUE_NAME = process.env.REDIS_MINT_QUEUE_NAME || 'mintQueue';

// ========================
// 🛠️ Worker Initialization
// ========================
const mintWorker = new Worker(
  REDIS_MINT_QUEUE_NAME,
  async (job: Job) => {
    console.log(`📥 [WebhookWorker] Received Job ${job.id}`);
    await mintNFT(job.data);
  },
  {
    connection: redis,
    concurrency: 5,
  }
);
const prepareWorker = new Worker(
  REDIS_PREPARE_QUEUE_NAME,
  async (job: Job) => {
    console.log(`📥 [WebhookWorker] Received Job ${job.id}`);
    await prepareNFTs(job.data.vaultId);
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
bindWorkerEvents("prepareWorker", prepareWorker);

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

import { Keypair, Transaction, SystemProgram, PublicKey, Connection } from "@solana/web3.js";
import { LAMPORTS_PER_SOL } from "@solana/web3.js"; // To convert SOL to lamports
import { decryptVaultKeyUint8 } from './lib/encrypt';

// Replace this with your connection details
const connection = new Connection("https://api.devnet.solana.com");

async function main() {
  const vault = await prisma.vault.findUnique({
    where: {
      id: "cmamezy3d0015fznyjc08dr08", // Replace with your vault ID
    },
    include: {
      qrSession: {
        include: {
          campaign: {
            include: {
              organizer: true,
            },
          },
        },
      },
    },
  });

  if (!vault) {
    console.log("Vault not found.");
    return;
  }

  const organizerWallet = vault.qrSession?.campaign.organizer.wallet;
  if (!organizerWallet) {
    console.log("Organizer wallet not found.");
    return;
  }

  // Decrypt the private key and get the vault's keypair
  const privateKey = decryptVaultKeyUint8(vault.privateKey);  // Assuming you have a decryption function
  const vaultWallet = Keypair.fromSecretKey(privateKey);

  // Check the balance of the vault
  const vaultPubkey = vaultWallet.publicKey;
  const vaultBalance = await connection.getBalance(vaultPubkey);
  console.log(`Vault balance: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);

  // Check if there's enough balance to transfer
  const bufferLamports = 0.00001 * LAMPORTS_PER_SOL;  // Buffer to avoid edge cases
  const lamportsToSend = 14700000000;

  if (lamportsToSend <= 0) {
    console.log("Not enough SOL in vault to transfer after buffer.");
    return;
  }

  // Create a transaction to transfer funds back to the organizer's wallet
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: vaultPubkey,
      toPubkey: new PublicKey(organizerWallet),
      lamports: lamportsToSend,
    })
  );

  // Set the fee payer and blockhash for the transaction
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.feePayer = vaultPubkey;
  transaction.recentBlockhash = blockhash;

  // Sign and send the transaction
  try {
    const signature = await connection.sendTransaction(transaction, [vaultWallet]);
    await connection.confirmTransaction(signature, "confirmed");
    console.log(`Transfer successful. Signature: ${signature}`);
  } catch (error) {
    console.error("Transaction failed:", error);
  }
}

// main().catch((error) => {
//   console.error("Error in main function:", error);
// });
