import assert from 'assert';
import {
  ApiPoolInfoV4,
  LIQUIDITY_STATE_LAYOUT_V4,
  LOOKUP_TABLE_CACHE,
  Liquidity,
  LiquidityPoolKeys,
  MARKET_STATE_LAYOUT_V3,
  Market,
  Percent,
  SPL_ACCOUNT_LAYOUT,
  SPL_MINT_LAYOUT,
  Token,
  TokenAccount,
  TokenAmount,
  TxVersion,
  buildSimpleTransaction,
  jsonInfo2PoolKeys,
} from '@raydium-io/raydium-sdk';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { TX_FEE } from '../constants';

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>;
type TestTxInputInfo = {
  outputToken: Token;
  targetPool: string;
  inputTokenAmount: TokenAmount;
  slippage: Percent;
  walletTokenAccounts: WalletTokenAccounts;
  wallet: Keypair;
};

async function getWalletTokenAccount(
  connection: Connection,
  wallet: PublicKey
): Promise<TokenAccount[]> {
  const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
    programId: TOKEN_PROGRAM_ID,
  });
  return walletTokenAccount.value.map(i => ({
    pubkey: i.pubkey,
    programId: i.account.owner,
    accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
  }));
}

async function swapOnlyAmm(connection: Connection, input: TestTxInputInfo) {
  const targetPoolInfo = await formatAmmKeysById(connection, input.targetPool);
  assert(targetPoolInfo, 'cannot find the target pool');
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;

  const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
    poolKeys: poolKeys,
    poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
    amountIn: input.inputTokenAmount,
    currencyOut: input.outputToken,
    slippage: input.slippage,
  });

  const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
    connection,
    poolKeys,
    userKeys: {
      tokenAccounts: input.walletTokenAccounts,
      owner: input.wallet.publicKey,
    },
    amountIn: input.inputTokenAmount,
    amountOut: minAmountOut,
    fixedSide: 'in',
    makeTxVersion: TxVersion.V0,
    computeBudgetConfig: {
      microLamports: 12_000 * TX_FEE,
      units: 100_000,
    },
  });
  return innerTransactions;
}

export async function formatAmmKeysById(
  connection: Connection,
  id: string
): Promise<ApiPoolInfoV4> {
  const account = await connection.getAccountInfo(new PublicKey(id));
  if (account === null) throw Error(' get id info error ');
  const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data);

  const marketId = info.marketId;
  const marketAccount = await connection.getAccountInfo(marketId);
  if (marketAccount === null) throw Error(' get market info error');
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);

  const lpMint = info.lpMint;
  const lpMintAccount = await connection.getAccountInfo(lpMint);
  if (lpMintAccount === null) throw Error(' get lp mint info error');
  const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data);

  return {
    id,
    baseMint: info.baseMint.toString(),
    quoteMint: info.quoteMint.toString(),
    lpMint: info.lpMint.toString(),
    baseDecimals: info.baseDecimal.toNumber(),
    quoteDecimals: info.quoteDecimal.toNumber(),
    lpDecimals: lpMintInfo.decimals,
    version: 4,
    programId: account.owner.toString(),
    authority: Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey.toString(),
    openOrders: info.openOrders.toString(),
    targetOrders: info.targetOrders.toString(),
    baseVault: info.baseVault.toString(),
    quoteVault: info.quoteVault.toString(),
    withdrawQueue: info.withdrawQueue.toString(),
    lpVault: info.lpVault.toString(),
    marketVersion: 3,
    marketProgramId: info.marketProgramId.toString(),
    marketId: info.marketId.toString(),
    marketAuthority: Market.getAssociatedAuthority({
      programId: info.marketProgramId,
      marketId: info.marketId,
    }).publicKey.toString(),
    marketBaseVault: marketInfo.baseVault.toString(),
    marketQuoteVault: marketInfo.quoteVault.toString(),
    marketBids: marketInfo.bids.toString(),
    marketAsks: marketInfo.asks.toString(),
    marketEventQueue: marketInfo.eventQueue.toString(),
    lookupTableAccount: PublicKey.default.toString(),
  };
}

export async function getBuyTx(
  solanaConnection: Connection,
  wallet: Keypair,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  amount: number,
  targetPool: string
) {
  const baseInfo = await getMint(solanaConnection, baseMint);
  if (baseInfo == null) {
    return null;
  }

  const baseDecimal = baseInfo.decimals;

  const baseToken = new Token(TOKEN_PROGRAM_ID, baseMint, baseDecimal);
  const quoteToken = new Token(TOKEN_PROGRAM_ID, quoteMint, 9);

  const quoteTokenAmount = new TokenAmount(quoteToken, Math.floor(amount * 10 ** 9));
  const slippage = new Percent(100, 100);
  const walletTokenAccounts = await getWalletTokenAccount(solanaConnection, wallet.publicKey);

  const instructions = await swapOnlyAmm(solanaConnection, {
    outputToken: baseToken,
    targetPool,
    inputTokenAmount: quoteTokenAmount,
    slippage,
    walletTokenAccounts,
    wallet: wallet,
  });

  const willSendTx = (
    await buildSimpleTransaction({
      connection: solanaConnection,
      makeTxVersion: TxVersion.V0,
      payer: wallet.publicKey,
      innerTransactions: instructions,
      addLookupTableInfo: LOOKUP_TABLE_CACHE,
    })
  )[0];
  if (willSendTx instanceof VersionedTransaction) {
    willSendTx.sign([wallet]);
    return willSendTx;
  }
  return null;
}

export async function getSellTx(
  solanaConnection: Connection,
  wallet: Keypair,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  amount: string,
  targetPool: string
) {
  try {
    const tokenAta = await getAssociatedTokenAddress(baseMint, wallet.publicKey);
    const tokenBal = await solanaConnection.getTokenAccountBalance(tokenAta);
    if (!tokenBal || tokenBal.value.uiAmount == 0) return null;
    const balance = tokenBal.value.amount;
    tokenBal.value.decimals;
    const baseToken = new Token(TOKEN_PROGRAM_ID, baseMint, tokenBal.value.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, quoteMint, 9);
    const baseTokenAmount = new TokenAmount(baseToken, amount);
    const slippage = new Percent(99, 100);
    const walletTokenAccounts = await getWalletTokenAccount(solanaConnection, wallet.publicKey);

    const instructions = await swapOnlyAmm(solanaConnection, {
      outputToken: quoteToken,
      targetPool,
      inputTokenAmount: baseTokenAmount,
      slippage,
      walletTokenAccounts,
      wallet: wallet,
    });

    const willSendTx = (
      await buildSimpleTransaction({
        connection: solanaConnection,
        makeTxVersion: TxVersion.V0,
        payer: wallet.publicKey,
        innerTransactions: instructions,
        addLookupTableInfo: LOOKUP_TABLE_CACHE,
      })
    )[0];
    if (willSendTx instanceof VersionedTransaction) {
      willSendTx.sign([wallet]);
      return willSendTx;
    }
    return null;
  } catch (error) {
    console.log('Error in selling token');
    return null;
  }
}

interface JupiterQuoteResponse {
  outAmount?: string;
  error?: string;
  [key: string]: any;
}

interface JupiterSwapResponse {
  swapTransaction: string;
}

export const getBuyTxWithJupiter = async (wallet: Keypair, baseMint: PublicKey, amount: number) => {
  try {
    console.log(`[JUPITER] Fetching buy quote for ${amount} SOL -> ${baseMint.toBase58()}`);
    const lamports = Math.floor(amount * 10 ** 9);
    
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${baseMint.toBase58()}&amount=${lamports}&slippageBps=10000`;
    console.log(`[JUPITER] Quote URL: ${quoteUrl}`);
    
    const quoteResponse = await fetch(quoteUrl);
    
    if (!quoteResponse.ok) {
      throw new Error(`Quote request failed: ${quoteResponse.status} ${quoteResponse.statusText}`);
    }
    
    const quoteData = (await quoteResponse.json()) as JupiterQuoteResponse;
    console.log(`[JUPITER] Quote response:`, quoteData);
    
    if (quoteData.error) {
      throw new Error(`Jupiter quote error: ${quoteData.error}`);
    }
    
    if (!quoteData.outAmount) {
      throw new Error('No route found for this swap');
    }

    const swapPayload = {
      quoteResponse: quoteData,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 100000,
    };
    
    console.log(`[JUPITER] Requesting swap transaction...`);
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(swapPayload),
    });
    
    if (!swapResponse.ok) {
      throw new Error(`Swap request failed: ${swapResponse.status} ${swapResponse.statusText}`);
    }
    
    const swapData = (await swapResponse.json()) as JupiterSwapResponse;
    console.log(`[JUPITER] Swap response received`);
    
    if (!swapData.swapTransaction) {
      throw new Error('No swap transaction returned from Jupiter');
    }

    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    transaction.sign([wallet]);
    console.log(`[JUPITER] Transaction signed successfully`);
    return transaction;
  } catch (error) {
    console.error('[JUPITER] Failed to get buy transaction:', error);
    throw error; // Don't swallow errors
  }
};

export const getSellTxWithJupiter = async (
  wallet: Keypair,
  baseMint: PublicKey,
  amount: string
) => {
  try {
    const quoteResponse = await (
      await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${baseMint.toBase58()}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=100`
      )
    ).json();

    const swapResponse = (await (
      await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 52000,
        }),
      })
    ).json()) as JupiterSwapResponse;

    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    transaction.sign([wallet]);
    return transaction;
  } catch (error) {
    console.log('Failed to get sell transaction');
    return null;
  }
};


