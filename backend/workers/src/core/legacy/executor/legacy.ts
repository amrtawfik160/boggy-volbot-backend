import { Connection, VersionedTransaction } from '@solana/web3.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from '../constants';

interface Blockhash {
  blockhash: string;
  lastValidBlockHeight: number;
}

export const execute = async (transaction: VersionedTransaction, latestBlockhash: Blockhash, isBuy: boolean = true) => {
  const solanaConnection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  });

  try {
    console.log(`[EXECUTOR] Sending ${isBuy ? 'buy' : 'sell'} transaction...`);
    const signature = await solanaConnection.sendRawTransaction(
      transaction.serialize(), 
      { 
        skipPreflight: true,
        maxRetries: 3,
      }
    );
    
    console.log(`[EXECUTOR] Transaction sent with signature: ${signature}`);
    
    const confirmation = await solanaConnection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      'confirmed'
    );

    if (confirmation.value.err) {
      console.error(`[EXECUTOR] Transaction failed:`, confirmation.value.err);
      throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
    } else {
      if (isBuy) {
        console.log(`Success in buy transaction: https://solscan.io/tx/${signature}`);
      } else {
        console.log(`Success in Sell transaction: https://solscan.io/tx/${signature}`);
      }
    }
    
    return signature;
  } catch (error) {
    console.error(`[EXECUTOR] ${isBuy ? 'Buy' : 'Sell'} transaction failed:`, error);
    throw error; // Don't swallow errors
  }
}

