import { describe, it, expect, beforeEach } from 'vitest';
import { Connection, Keypair } from '@solana/web3.js';
import { ExecutorFactory, getExecutorTypeFromCampaign } from '../factory';
import { ExecutorType, ExecutorConfig, JitoExecutorConfig } from '../types';
import { LegacyExecutor } from '../legacy-executor';
import { JitoExecutor } from '../jito-executor';

describe('ExecutorFactory', () => {
  let baseConfig: ExecutorConfig;
  let jitoConfig: JitoExecutorConfig;

  beforeEach(() => {
    baseConfig = {
      connection: new Connection('https://api.mainnet-beta.solana.com'),
      rpcEndpoint: 'https://api.mainnet-beta.solana.com',
      rpcWebsocketEndpoint: 'wss://api.mainnet-beta.solana.com',
    };

    jitoConfig = {
      ...baseConfig,
      blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
      jitoAuthKeypair: Keypair.generate(),
      jitoTipAmount: 10000,
      bundleTransactionLimit: 4,
      bundleTimeoutMs: 30000,
    };
  });

  describe('create()', () => {
    it('should create Legacy executor when type is LEGACY', () => {
      const executor = ExecutorFactory.create(ExecutorType.LEGACY, baseConfig);

      expect(executor).toBeInstanceOf(LegacyExecutor);
      expect(executor.getType()).toBe(ExecutorType.LEGACY);
    });

    it('should create Jito executor when type is JITO', () => {
      const executor = ExecutorFactory.create(ExecutorType.JITO, jitoConfig);

      expect(executor).toBeInstanceOf(JitoExecutor);
      expect(executor.getType()).toBe(ExecutorType.JITO);
    });

    it('should throw error when creating Jito executor with wrong config', () => {
      expect(() => {
        ExecutorFactory.create(ExecutorType.JITO, baseConfig);
      }).toThrow('Jito executor requires JitoExecutorConfig');
    });

    it('should throw error for unknown executor type', () => {
      expect(() => {
        ExecutorFactory.create('UNKNOWN' as ExecutorType, baseConfig);
      }).toThrow('Unknown executor type');
    });
  });

  describe('fromEnvironment()', () => {
    it('should create Legacy executor when useJito is false', () => {
      const executor = ExecutorFactory.fromEnvironment(
        false,
        'https://api.mainnet-beta.solana.com',
        'wss://api.mainnet-beta.solana.com'
      );

      expect(executor).toBeInstanceOf(LegacyExecutor);
    });

    it('should create Jito executor when useJito is true with config', () => {
      const executor = ExecutorFactory.fromEnvironment(
        true,
        'https://api.mainnet-beta.solana.com',
        'wss://api.mainnet-beta.solana.com',
        undefined,
        {
          blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
          authKeypair: Keypair.generate(),
          tipAmount: 10000,
        }
      );

      expect(executor).toBeInstanceOf(JitoExecutor);
    });

    it('should throw error when useJito is true without jito config', () => {
      expect(() => {
        ExecutorFactory.fromEnvironment(
          true,
          'https://api.mainnet-beta.solana.com',
          'wss://api.mainnet-beta.solana.com'
        );
      }).toThrow('Jito configuration is required when useJito is true');
    });

    it('should use provided connection if given', () => {
      const customConnection = new Connection('https://custom-rpc.com');

      const executor = ExecutorFactory.fromEnvironment(
        false,
        'https://api.mainnet-beta.solana.com',
        'wss://api.mainnet-beta.solana.com',
        customConnection
      );

      expect(executor).toBeInstanceOf(LegacyExecutor);
    });

    it('should use default values for optional Jito params', () => {
      const executor = ExecutorFactory.fromEnvironment(
        true,
        'https://api.mainnet-beta.solana.com',
        'wss://api.mainnet-beta.solana.com',
        undefined,
        {
          blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
          authKeypair: Keypair.generate(),
          tipAmount: 10000,
          // bundleTransactionLimit and bundleTimeoutMs not provided
        }
      );

      expect(executor).toBeInstanceOf(JitoExecutor);
    });
  });
});

describe('getExecutorTypeFromCampaign()', () => {
  it('should return JITO when useJito is true', () => {
    const type = getExecutorTypeFromCampaign({ useJito: true });
    expect(type).toBe(ExecutorType.JITO);
  });

  it('should return LEGACY when useJito is false', () => {
    const type = getExecutorTypeFromCampaign({ useJito: false });
    expect(type).toBe(ExecutorType.LEGACY);
  });

  it('should return LEGACY when useJito is undefined', () => {
    const type = getExecutorTypeFromCampaign({});
    expect(type).toBe(ExecutorType.LEGACY);
  });
});
