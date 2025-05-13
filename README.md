🚀 Solix Worker

Solix Worker is a **Redis-based job queue processor** using **BullMQ** and **Inhouse Redis**. It efficiently processes **NFT minting** jobs for funded QR sessions on the Solana blockchain.


---

## 📂 Project Structure
```
solix-worker/
├── LICENSE
├── package.json
├── prisma
│   └── schema.prisma
├── README.md
├── src
│   ├── db
│   │   ├── prisma.ts
│   │   └── redis.ts
│   ├── index.ts
│   ├── lib
│   │   ├── cacheData.ts
│   │   ├── encrypt.ts
└── tsconfig.json
```

---

## 🛠 Installation & Setup

### 1️⃣ Clone the Repository
```sh
git clone https://github.com/TechWizardLabs/zkdrops-worker.git
cd solix-worker
```

### 2️⃣ Install Dependencies
```sh
pnpm install
```

### 3️⃣ Create `.env` File
```sh
touch .env
```

Add the following environment variables:
```
ENCRYPTION_KEY = <>
ENCRYPTION_IV = <>
DATABASE_URL = <>
HELIUS_MAINNET_API_KEY  = <>
HELIUS_DEVNET_API_KEY  = <>
MAINNET_WEBHOOK_ID  = <>
DEVNET_WEBHOOK_ID  = <>
WEBHOOK_MAINNET_SECRET  = <>
WEBHOOK_DEVNET_SECRET  = <>
REDIS_QUEUE_NAME = <>
REDIS_FEEDING_QUEUE = <>
NODE_ENV = <>
REDIS_HOST = <>
REDIS_PORT  = <>
REDIS_PASSWORD  = <>
REDIS_DB  = <>
```

## 🛠 Scripts

```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "dev": "tsx src/worker.ts",
    "build": "tsc",
    "start": "node dist/worker.js"
  }
}
```

- **`pnpm dev`** → Runs the worker in development mode.
- **`pnpm build`** → Compiles the project to JavaScript.
- **`pnpm start`** → Runs the compiled worker.

---

## 📝 License
This project is open-source and available under the [MIT License](LICENSE).

---

## 💡 Contributions
Feel free to fork this project and submit pull requests! 🎉