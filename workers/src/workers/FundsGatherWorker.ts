import { Connection, Transaction, SystemProgram, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';
import { FundsGatherJobPayload } from '../types';
import { getKeypairFromEncrypted, decryptPrivateKey } from './utils/crypto';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';

export interface FundsGatherJobData extends FundsGatherJobPayload {
  campaignId?: string;
  dbJobId?: string;
}

export interface FundsGatherJobResult {
  success: boolean;
  gatheredWallets?: number;
  totalGathered?: number;
}

export class FundsGatherWorker extends BaseWorker<FundsGatherJobData, FundsGatherJobResult> {
  private connection: Connection;

  constructor(
    config: Omit<BaseWorkerConfig, 'queueName'>,
    connection: Connection
  ) {
    super({
      ...config,
      queueName: 'funds.gather',
      concurrency: 1, // Sequential processing to avoid conflicts
      enableIdempotency: false,
      enableDeadLetterQueue: true,
    });

    this.connection = connection;
  }

  protected async execute(
    data: FundsGatherJobData,
    context: JobContext
  ): Promise<FundsGatherJobResult> {
    const { campaignId } = data;

    await context.updateProgress(10, 'Fetching campaign details');

    const { data: campaign, error: campaignError } = await context.supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignId}. Error: ${campaignError?.message}`);
    }

    await context.updateProgress(20, 'Fetching active wallets');

    // Get all active wallets for user
    const { data: wallets } = await context.supabase
      .from('wallets')
      .select('*')
      .eq('user_id', campaign.user_id)
      .eq('is_active', true);

    if (!wallets || wallets.length === 0) {
      throw new Error('No active wallets found for funds gathering');
    }

    await context.updateProgress(30, 'Identifying main wallet');

    // Choose main wallet as the first with a private key
    const mainWallet = wallets.find((w: any) => w.encrypted_private_key) || wallets[0];
    if (!mainWallet || !mainWallet.encrypted_private_key) {
      throw new Error('No suitable main wallet with private key found');
    }

    const mainPrivateKey = decryptPrivateKey(Buffer.from(mainWallet.encrypted_private_key));
    const mainKeypair = Keypair.fromSecretKey(bs58.decode(mainPrivateKey));

    await context.updateProgress(40, `Gathering funds from ${wallets.length} wallets`);

    let gatheredWallets = 0;
    let totalGathered = 0;
    const totalWallets = wallets.length - 1; // Exclude main wallet

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      try {
        if (!w.encrypted_private_key) continue;

        const priv = decryptPrivateKey(Buffer.from(w.encrypted_private_key));
        const kp = Keypair.fromSecretKey(bs58.decode(priv));

        // Skip main wallet
        if (kp.publicKey.equals(mainKeypair.publicKey)) continue;

        const balance = await this.connection.getBalance(kp.publicKey);
        if (balance <= 0) continue;

        const rent = await this.connection.getMinimumBalanceForRentExemption(32);
        const lamportsToSend = Math.max(balance - rent - 13_000, 0);
        if (lamportsToSend <= 0) continue;

        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 600_000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }),
          SystemProgram.transfer({
            fromPubkey: kp.publicKey,
            toPubkey: mainKeypair.publicKey,
            lamports: lamportsToSend,
          })
        );

        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        tx.feePayer = kp.publicKey;

        await sendAndConfirmTransaction(this.connection, tx, [kp], { skipPreflight: true });

        gatheredWallets++;
        totalGathered += lamportsToSend;

        await context.updateProgress(
          40 + Math.floor((i / totalWallets) * 50),
          `Gathered from ${gatheredWallets} wallets (${(totalGathered / 1e9).toFixed(4)} SOL)`
        );
      } catch (e) {
        console.error('Failed to gather from wallet', w.address, e);
      }
    }

    await context.updateProgress(100, `Funds gathering completed - ${gatheredWallets} wallets processed`);

    return {
      success: true,
      gatheredWallets,
      totalGathered
    };
  }
}
