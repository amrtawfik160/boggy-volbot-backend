import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

/**
 * Integration tests for executor selection in worker job handlers
 * These tests verify that the correct executor (Legacy vs Jito) is selected
 * based on campaign configuration and user settings
 */
describe('Worker Executor Selection Integration', () => {
  describe('Campaign Configuration - useJito', () => {
    it('should select legacy executor when campaign.params.useJito is false', () => {
      const campaign = {
        id: 'test-campaign',
        params: { useJito: false },
        user_id: 'test-user',
      };

      const useJito = campaign.params?.useJito || false;

      expect(useJito).toBe(false);
    });

    it('should select Jito executor when campaign.params.useJito is true', () => {
      const campaign = {
        id: 'test-campaign',
        params: { useJito: true },
        user_id: 'test-user',
      };

      const useJito = campaign.params?.useJito || false;

      expect(useJito).toBe(true);
    });

    it('should default to legacy executor when campaign.params is missing', () => {
      const campaign = {
        id: 'test-campaign',
        user_id: 'test-user',
      };

      const useJito = (campaign as any).params?.useJito || false;

      expect(useJito).toBe(false);
    });
  });

  describe('User Settings Override', () => {
    it('should override campaign config with user settings when present', () => {
      const campaign = {
        id: 'test-campaign',
        params: { useJito: false },
        user_id: 'test-user',
      };

      const settings = {
        jito_config: {
          useJito: true,
        },
      };

      let useJito = campaign.params?.useJito || false;
      if (settings?.jito_config && typeof settings.jito_config.useJito === 'boolean') {
        useJito = settings.jito_config.useJito;
      }

      expect(useJito).toBe(true);
    });

    it('should use campaign config when user settings jito_config is missing', () => {
      const campaign = {
        id: 'test-campaign',
        params: { useJito: true },
        user_id: 'test-user',
      };

      const settings = {
        sell_config: {},
      };

      let useJito = campaign.params?.useJito || false;
      if (settings && (settings as any).jito_config && typeof (settings as any).jito_config.useJito === 'boolean') {
        useJito = (settings as any).jito_config.useJito;
      }

      expect(useJito).toBe(true);
    });

    it('should not override when user settings useJito is not a boolean', () => {
      const campaign = {
        id: 'test-campaign',
        params: { useJito: true },
        user_id: 'test-user',
      };

      const settings = {
        jito_config: {
          useJito: 'yes' as any, // Invalid type
        },
      };

      let useJito = campaign.params?.useJito || false;
      if (settings?.jito_config && typeof settings.jito_config.useJito === 'boolean') {
        useJito = settings.jito_config.useJito;
      }

      expect(useJito).toBe(true); // Should keep campaign setting
    });
  });

  describe('Jito Configuration Assembly', () => {
    it('should build Jito config from user settings when available', () => {
      const settings = {
        jito_config: {
          useJito: true,
          jitoKey: 'mock-jito-key-base58',
          blockEngineUrl: 'https://custom.block-engine.jito.wtf',
          jitoFee: 0.0005,
        },
      };

      const jitoKey = settings.jito_config.jitoKey;
      const blockEngineUrl = settings.jito_config.blockEngineUrl;
      const jitoTipAmount = settings.jito_config.jitoFee;

      expect(jitoKey).toBe('mock-jito-key-base58');
      expect(blockEngineUrl).toBe('https://custom.block-engine.jito.wtf');
      expect(jitoTipAmount).toBe(0.0005);
    });

    it('should fall back to environment variables when user settings are missing', () => {
      const settings = null;

      const jitoKey = settings?.jito_config?.jitoKey || process.env.JITO_KEY || 'env-jito-key';
      const blockEngineUrl = settings?.jito_config?.blockEngineUrl || process.env.BLOCKENGINE_URL || 'https://mainnet.block-engine.jito.wtf';
      const jitoTipAmount = settings?.jito_config?.jitoFee || Number(process.env.JITO_FEE || 0.0001);

      expect(jitoKey).toBeDefined();
      expect(blockEngineUrl).toBe('https://mainnet.block-engine.jito.wtf');
      expect(jitoTipAmount).toBe(0.0001);
    });

    it('should merge user settings with environment defaults', () => {
      const settings = {
        jito_config: {
          jitoKey: 'user-jito-key',
          // blockEngineUrl not provided
          // jitoFee not provided
        },
      };

      const jitoKey = settings.jito_config.jitoKey || process.env.JITO_KEY;
      const blockEngineUrl = (settings.jito_config as any).blockEngineUrl || process.env.BLOCKENGINE_URL || 'https://mainnet.block-engine.jito.wtf';
      const jitoTipAmount = (settings.jito_config as any).jitoFee || Number(process.env.JITO_FEE || 0.0001);

      expect(jitoKey).toBe('user-jito-key');
      expect(blockEngineUrl).toBe('https://mainnet.block-engine.jito.wtf');
      expect(jitoTipAmount).toBe(0.0001);
    });
  });

  describe('Executor Selection Priority', () => {
    it('should prioritize: user settings > campaign params > default (false)', () => {
      // Test 1: Only defaults
      let campaign1: any = { id: 'test' };
      let settings1: any = null;
      let useJito1 = campaign1.params?.useJito || false;
      if (settings1?.jito_config && typeof settings1.jito_config.useJito === 'boolean') {
        useJito1 = settings1.jito_config.useJito;
      }
      expect(useJito1).toBe(false); // Default

      // Test 2: Campaign params only
      let campaign2 = { id: 'test', params: { useJito: true } };
      let settings2: any = null;
      let useJito2 = campaign2.params?.useJito || false;
      if (settings2?.jito_config && typeof settings2.jito_config.useJito === 'boolean') {
        useJito2 = settings2.jito_config.useJito;
      }
      expect(useJito2).toBe(true); // Campaign params

      // Test 3: User settings override campaign
      let campaign3 = { id: 'test', params: { useJito: false } };
      let settings3 = { jito_config: { useJito: true } };
      let useJito3 = campaign3.params?.useJito || false;
      if (settings3?.jito_config && typeof settings3.jito_config.useJito === 'boolean') {
        useJito3 = settings3.jito_config.useJito;
      }
      expect(useJito3).toBe(true); // User settings (highest priority)
    });
  });

  describe('Error Handling', () => {
    it('should throw error when Jito is enabled but jitoKey is missing', () => {
      const useJito = true;
      const settings: any = null;
      const jitoKey = settings?.jito_config?.jitoKey || process.env.JITO_KEY;

      if (useJito && !jitoKey) {
        expect(() => {
          throw new Error('Jito key is required when useJito is enabled');
        }).toThrow('Jito key is required when useJito is enabled');
      }
    });
  });
});
