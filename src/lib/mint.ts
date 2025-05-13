const activeTimers = new Set<string>();
import { Metaplex, irysStorage, keypairIdentity } from '@metaplex-foundation/js';
import { Campaign, Organizer, QRSession, Vault } from '@prisma/client';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import prisma from '../db/prisma';
import { decryptVaultKeyUint8 } from './encrypt';

const RPC_ENDPOINT = `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

interface CampaignState extends Campaign {
  organizer: Organizer
}

interface QRSessionState extends QRSession {
  campaign: CampaignState
}

interface VaultState extends Vault {
  qrSession: QRSessionState
}

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

async function returnRemainingFunds(vaultWallet: Keypair, vault: VaultState, campaign: CampaignState) {
  if (!vault.qrSession.maxClaims || campaign.organizer.wallet === null) {
    return;
  }
  const TRANSFER_COST_PER_NFT = 0.000005;
  const MINIMUM_BUFFER_SOL = 0.01;
  const reservedSol = (vault.qrSession.maxClaims * TRANSFER_COST_PER_NFT) + MINIMUM_BUFFER_SOL;
  const reservedLamports = Math.ceil(reservedSol * LAMPORTS_PER_SOL);

  // Get current vault balance
  const vaultBalance = await connection.getBalance(vaultWallet.publicKey);

  // If there's more than we need, refund the excess
  if (vaultBalance > reservedLamports) {
    const lamportsToSendBack = vaultBalance - reservedLamports;

    const organizerPublicKey = new PublicKey(campaign.organizer.wallet);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: vaultWallet.publicKey,
        toPubkey: organizerPublicKey,
        lamports: lamportsToSendBack,
      })
    );

    await sendAndConfirmTransaction(connection, tx, [vaultWallet]);
    console.log(`[Vault Refund] Refunded ${lamportsToSendBack / LAMPORTS_PER_SOL} SOL to organizer`);
  }

}

export function startTimer(label: string) {
  if (activeTimers.has(label)) {
    console.warn(`[Timer] '${label}' is already running.`);
    return;
  }
  activeTimers.add(label);
  console.time(label);
}

export function endTimer(label: string) {
  if (!activeTimers.has(label)) {
    console.warn(`[Timer] Tried to end unknown label '${label}'`);
    return;
  }
  console.timeEnd(label);
  activeTimers.delete(label);
}

export async function prepareNFTs(vaultId: string) {
  try {
    startTimer("Total mintNFTs");
    const vault = await prisma.vault.findUnique({
      where: {
        id: vaultId
      },
      include: {
        qrSession: {
          include: {
            campaign: {
              include: {
                organizer: true
              }
            }
          }
        }
      }
    });

    if (!vault) {
      console.log("Vault not found");
      return;
    }

    const privateKey = decryptVaultKeyUint8(vault.privateKey);
    const vaultWallet = Keypair.fromSecretKey(privateKey);

    startTimer("Metaplex");
    if (!vaultWallet) {
      console.log("Vault wallet is invalid");
      return;
    }

    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(vaultWallet))
      .use(
        irysStorage({
          address: "https://devnet.irys.xyz",
          providerUrl: "https://api.devnet.solana.com",
          timeout: 60000,
        }),
      );

    const { campaign } = vault.qrSession;

    if (!campaign?.tokenUri || !campaign?.name || !campaign?.tokenSymbol) {
      console.log("Campaign data is missing required fields");
      return;
    }

    const { nft: collectionNft } = await metaplex.nfts().create({
      uri: campaign.tokenUri,
      name: `${campaign.name} Collection`,
      symbol: campaign.tokenSymbol,
      sellerFeeBasisPoints: 0,
      isMutable: false,
      isCollection: true,
    });
    endTimer("Metaplex");

    startTimer("Prisma");
    await prisma.qRSession.update({
      where: {
        id: vault.qrSession.id
      },
      data: {
        collection: collectionNft.address.toBase58()
      }
    });
    endTimer("Prisma");

    endTimer("Total mintNFTs");
  } catch (error) {
    console.error("Error preparing NFTs: ", error);
    throw error;
  }
}

export async function mintNFT(jobData: any) {
  const { claimId } = jobData;

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      qrSession: {
        include: {
          vault: true,
          campaign: {
            include: {
              organizer: true
            }
          }
        }
      }
    }
  });

  if (
    !claim ||
    !claim.qrSession ||
    !claim.qrSession.vault?.[0] ||
    !claim.qrSession.collection ||
    !claim.wallet
  ) {
    console.warn('Missing data for mintNFT:', claimId);
    return;
  }

  const privateKey = decryptVaultKeyUint8(claim.qrSession.vault[0].privateKey);
  const vaultWallet = Keypair.fromSecretKey(privateKey);
  const campaign = claim.qrSession.campaign;
  const collectionAddress = new PublicKey(claim.qrSession.collection);
  const recipient = new PublicKey(claim.wallet);

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(vaultWallet))
    .use(
      irysStorage({
        address: "https://devnet.irys.xyz",
        providerUrl: "https://api.devnet.solana.com",
        timeout: 60000,
      })
    );

  const { nft } = await metaplex.nfts().create({
    uri: campaign.tokenUri,
    name: campaign.name,
    symbol: campaign.tokenSymbol,
    sellerFeeBasisPoints: 0,
    isMutable: false,
    isCollection: false,
    collection: collectionAddress,
    tokenOwner: recipient,
  });
  

  const token = await prisma.token.create({
    data: {
      mintAddress: nft.address.toBase58(),
      metadataUri: campaign.metadataUri!,
      campaignId: campaign.id,
      qrSessionId: claim.qrSession.id
    }
  });

  await prisma.claim.update({
    where: { id: claimId },
    data: {
      mintAddress: nft.address.toBase58(),
      token: {
        connect: { id: token.id }
      },
      status: "CLAIMED"
    }
  });
}
