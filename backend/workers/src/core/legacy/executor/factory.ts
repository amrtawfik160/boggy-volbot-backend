import { Connection, Keypair } from '@solana/web3.js';
import {
  TransactionExecutor,
  ExecutorType,
  ExecutorConfig,
  JitoExecutorConfig,
} from './types';
import { LegacyExecutor } from './legacy-executor';
import { JitoExecutor } from './jito-executor';

/**
 * Factory for creating transaction executors
 */
export class ExecutorFactory {
  /**
   * Create a transaction executor based on type and configuration
   */
  static create(
    type: ExecutorType,
    config: ExecutorConfig | JitoExecutorConfig
  ): TransactionExecutor {
    switch (type) {
      case ExecutorType.LEGACY:
        return new LegacyExecutor(config);

      case ExecutorType.JITO:
        if (!this.isJitoConfig(config)) {
          throw new Error('Jito executor requires JitoExecutorConfig');
        }
        return new JitoExecutor(config);

      default:
        throw new Error(`Unknown executor type: ${type}`);
    }
  }

  /**
   * Create executor from environment variables and campaign configuration
   */
  static fromEnvironment(
    useJito: boolean,
    rpcEndpoint: string,
    rpcWebsocketEndpoint: string,
    connection?: Connection,
    jitoConfig?: {
      blockEngineUrl: string;
      authKeypair: Keypair;
      tipAmount: number;
      bundleTransactionLimit?: number;
      bundleTimeoutMs?: number;
    }
  ): TransactionExecutor {
    const baseConfig: ExecutorConfig = {
      connection: connection || new Connection(rpcEndpoint, {
        wsEndpoint: rpcWebsocketEndpoint,
      }),
      rpcEndpoint,
      rpcWebsocketEndpoint,
    };

    if (useJito) {
      if (!jitoConfig) {
        throw new Error('Jito configuration is required when useJito is true');
      }

      const jitoExecutorConfig: JitoExecutorConfig = {
        ...baseConfig,
        blockEngineUrl: jitoConfig.blockEngineUrl,
        jitoAuthKeypair: jitoConfig.authKeypair,
        jitoTipAmount: jitoConfig.tipAmount,
        bundleTransactionLimit: jitoConfig.bundleTransactionLimit ?? 4,
        bundleTimeoutMs: jitoConfig.bundleTimeoutMs ?? 30000,
      };

      return ExecutorFactory.create(ExecutorType.JITO, jitoExecutorConfig);
    }

    return ExecutorFactory.create(ExecutorType.LEGACY, baseConfig);
  }

  /**
   * Type guard to check if config is JitoExecutorConfig
   */
  private static isJitoConfig(
    config: ExecutorConfig | JitoExecutorConfig
  ): config is JitoExecutorConfig {
    return (
      'blockEngineUrl' in config &&
      'jitoAuthKeypair' in config &&
      'jitoTipAmount' in config
    );
  }
}

/**
 * Helper function to determine executor type from campaign configuration
 */
export function getExecutorTypeFromCampaign(campaignConfig: {
  useJito?: boolean;
}): ExecutorType {
  return campaignConfig.useJito ? ExecutorType.JITO : ExecutorType.LEGACY;
}
