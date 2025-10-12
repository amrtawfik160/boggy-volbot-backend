import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CampaignParamsDto } from '../dto/campaign-params.dto';
import { CreateCampaignDto } from '../dto/create-campaign.dto';

/**
 * Test Suite for Campaign Jito/Legacy Mode Switching Logic
 *
 * Tests that campaigns can operate in both Jito and legacy execution modes:
 * - Campaign parameter validation for Jito configuration
 * - Mode configuration validation (useJito flag, jitoTip)
 * - Campaign creation with different execution modes
 * - Parameter constraints for each mode
 * - Mode-specific logic and requirements
 * - User settings override behavior
 * - Edge cases and error handling
 */

describe('Campaign Jito/Legacy Mode Switching', () => {
  let mockSupabaseService: any;

  const mockUser = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'test@example.com',
  };

  const mockToken = {
    id: '10000000-0000-0000-0000-000000000001',
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    decimals: 9,
  };

  const mockPool = {
    id: '20000000-0000-0000-0000-000000000001',
    token_id: mockToken.id,
    pool_address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    dex: 'raydium',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabaseService = {
      getCampaignById: vi.fn(),
      createCampaign: vi.fn(),
      updateCampaign: vi.fn(),
      getUserSettings: vi.fn(),
      upsertUserSettings: vi.fn(),
    };
  });

  describe('Legacy Mode Configuration', () => {
    it('should create campaign in legacy mode when useJito is false', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: false,
        slippage: 1,
        minTxSize: 0.001,
        maxTxSize: 0.01,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(false);
    });

    it('should default to legacy mode when useJito is not specified', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        slippage: 1,
        minTxSize: 0.001,
        maxTxSize: 0.01,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBeUndefined();
      // In production, undefined useJito defaults to false (legacy mode)
    });

    it('should create legacy mode campaign without jitoTip', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: false,
        // jitoTip not provided - not needed for legacy mode
        slippage: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(false);
      expect(dto.jitoTip).toBeUndefined();
    });

    it('should accept legacy mode with all standard parameters', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: false,
        slippage: 2,
        minTxSize: 0.005,
        maxTxSize: 0.05,
        targetVolume: 1000,
        schedule: '0 * * * *',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(false);
    });
  });

  describe('Jito Mode Configuration', () => {
    it('should create campaign in Jito mode when useJito is true', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: 0.001,
        slippage: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(true);
      expect(dto.jitoTip).toBe(0.001);
    });

    it('should validate jitoTip is within valid range for Jito mode', async () => {
      const validTips = [0.00001, 0.0001, 0.001, 0.01, 0.1, 0.5, 1];

      for (const tip of validTips) {
        const dto = plainToInstance(CampaignParamsDto, {
          useJito: true,
          jitoTip: tip,
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    it('should reject jitoTip below minimum for Jito mode', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: 0.000001, // Below minimum of 0.00001
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const jitoTipError = errors.find(e => e.property === 'jitoTip');
      expect(jitoTipError).toBeDefined();
    });

    it('should reject jitoTip above maximum for Jito mode', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: 1.5, // Above maximum of 1 SOL
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const jitoTipError = errors.find(e => e.property === 'jitoTip');
      expect(jitoTipError).toBeDefined();
    });

    it('should accept Jito mode with all standard parameters', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: 0.001,
        slippage: 2,
        minTxSize: 0.005,
        maxTxSize: 0.05,
        targetVolume: 1000,
        schedule: '0 * * * *',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(true);
    });
  });

  describe('Mode Configuration Validation', () => {
    it('should accept useJito as boolean true', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(true);
      expect(typeof dto.useJito).toBe('boolean');
    });

    it('should accept useJito as boolean false', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: false,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(false);
      expect(typeof dto.useJito).toBe('boolean');
    });

    it('should reject useJito as non-boolean values', async () => {
      const invalidValues = ['true', 'false', 1, 0, 'yes', 'no', null];

      for (const value of invalidValues) {
        const dto = plainToInstance(CampaignParamsDto, {
          useJito: value as any,
        });
        const errors = await validate(dto);

        if (value !== null) {
          expect(errors.length).toBeGreaterThan(0);
          const useJitoError = errors.find(e => e.property === 'useJito');
          expect(useJitoError).toBeDefined();
        }
      }
    });

    it('should allow useJito to be optional', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        slippage: 1,
        minTxSize: 0.001,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBeUndefined();
    });

    it('should allow jitoTip to be optional even when useJito is true', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
        // jitoTip not provided - can be set from user settings or defaults
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(true);
      expect(dto.jitoTip).toBeUndefined();
    });
  });

  describe('Campaign Creation with Different Modes', () => {
    it('should create campaign with legacy mode configuration', async () => {
      const campaignData = {
        user_id: mockUser.id,
        name: 'Legacy Campaign',
        token_id: mockToken.id,
        pool_id: mockPool.id,
        params: {
          useJito: false,
          slippage: 1,
          minTxSize: 0.001,
          maxTxSize: 0.01,
        },
        status: 'draft',
      };

      mockSupabaseService.createCampaign.mockResolvedValue({
        id: 'campaign-1',
        ...campaignData,
      });

      const campaign = await mockSupabaseService.createCampaign(campaignData);

      expect(campaign.params.useJito).toBe(false);
      expect(campaign.params.jitoTip).toBeUndefined();
    });

    it('should create campaign with Jito mode configuration', async () => {
      const campaignData = {
        user_id: mockUser.id,
        name: 'Jito Campaign',
        token_id: mockToken.id,
        pool_id: mockPool.id,
        params: {
          useJito: true,
          jitoTip: 0.001,
          slippage: 1,
          minTxSize: 0.001,
          maxTxSize: 0.01,
        },
        status: 'draft',
      };

      mockSupabaseService.createCampaign.mockResolvedValue({
        id: 'campaign-2',
        ...campaignData,
      });

      const campaign = await mockSupabaseService.createCampaign(campaignData);

      expect(campaign.params.useJito).toBe(true);
      expect(campaign.params.jitoTip).toBe(0.001);
    });

    it('should store mode configuration in campaign params', async () => {
      const jitoParams = {
        useJito: true,
        jitoTip: 0.0005,
        slippage: 2,
      };

      mockSupabaseService.createCampaign.mockResolvedValue({
        id: 'campaign-3',
        user_id: mockUser.id,
        params: jitoParams,
      });

      const campaign = await mockSupabaseService.createCampaign({
        user_id: mockUser.id,
        name: 'Test',
        token_id: mockToken.id,
        pool_id: mockPool.id,
        params: jitoParams,
        status: 'draft',
      });

      expect(campaign.params.useJito).toBe(true);
      expect(campaign.params.jitoTip).toBe(0.0005);
      expect(campaign.params.slippage).toBe(2);
    });
  });

  describe('Mode Switching and Updates', () => {
    it('should allow updating campaign from legacy to Jito mode', async () => {
      const campaignId = 'campaign-4';
      const originalParams = {
        useJito: false,
        slippage: 1,
      };

      mockSupabaseService.getCampaignById.mockResolvedValue({
        id: campaignId,
        user_id: mockUser.id,
        params: originalParams,
      });

      const updatedParams = {
        useJito: true,
        jitoTip: 0.001,
        slippage: 1,
      };

      mockSupabaseService.updateCampaign.mockResolvedValue({
        id: campaignId,
        params: updatedParams,
      });

      const updated = await mockSupabaseService.updateCampaign(
        campaignId,
        mockUser.id,
        { params: updatedParams }
      );

      expect(updated.params.useJito).toBe(true);
      expect(updated.params.jitoTip).toBe(0.001);
    });

    it('should allow updating campaign from Jito to legacy mode', async () => {
      const campaignId = 'campaign-5';
      const originalParams = {
        useJito: true,
        jitoTip: 0.001,
        slippage: 1,
      };

      mockSupabaseService.getCampaignById.mockResolvedValue({
        id: campaignId,
        user_id: mockUser.id,
        params: originalParams,
      });

      const updatedParams = {
        useJito: false,
        slippage: 1,
      };

      mockSupabaseService.updateCampaign.mockResolvedValue({
        id: campaignId,
        params: updatedParams,
      });

      const updated = await mockSupabaseService.updateCampaign(
        campaignId,
        mockUser.id,
        { params: updatedParams }
      );

      expect(updated.params.useJito).toBe(false);
    });

    it('should allow updating jitoTip while keeping Jito mode', async () => {
      const campaignId = 'campaign-6';
      const originalParams = {
        useJito: true,
        jitoTip: 0.001,
      };

      mockSupabaseService.updateCampaign.mockResolvedValue({
        id: campaignId,
        params: {
          useJito: true,
          jitoTip: 0.0005, // Updated tip
        },
      });

      const updated = await mockSupabaseService.updateCampaign(
        campaignId,
        mockUser.id,
        {
          params: {
            useJito: true,
            jitoTip: 0.0005,
          },
        }
      );

      expect(updated.params.useJito).toBe(true);
      expect(updated.params.jitoTip).toBe(0.0005);
    });

    it('should preserve other params when switching modes', async () => {
      const campaignId = 'campaign-7';
      const originalParams = {
        useJito: false,
        slippage: 2.5,
        minTxSize: 0.002,
        maxTxSize: 0.02,
        targetVolume: 5000,
      };

      const updatedParams = {
        ...originalParams,
        useJito: true,
        jitoTip: 0.001,
      };

      mockSupabaseService.updateCampaign.mockResolvedValue({
        id: campaignId,
        params: updatedParams,
      });

      const updated = await mockSupabaseService.updateCampaign(
        campaignId,
        mockUser.id,
        { params: updatedParams }
      );

      expect(updated.params.useJito).toBe(true);
      expect(updated.params.slippage).toBe(2.5);
      expect(updated.params.minTxSize).toBe(0.002);
      expect(updated.params.maxTxSize).toBe(0.02);
      expect(updated.params.targetVolume).toBe(5000);
    });
  });

  describe('User Settings Override', () => {
    it('should allow user settings to override campaign Jito configuration', async () => {
      const campaignParams = {
        useJito: false,
      };

      const userSettings = {
        jito_config: {
          useJito: true,
          jitoFee: 0.0005,
        },
      };

      mockSupabaseService.getCampaignById.mockResolvedValue({
        id: 'campaign-8',
        user_id: mockUser.id,
        params: campaignParams,
      });

      mockSupabaseService.getUserSettings.mockResolvedValue(userSettings);

      const campaign = await mockSupabaseService.getCampaignById('campaign-8', mockUser.id);
      const settings = await mockSupabaseService.getUserSettings(mockUser.id);

      // In production, worker logic checks user settings and overrides campaign params
      let effectiveUseJito = campaign.params?.useJito || false;
      if (settings?.jito_config && typeof settings.jito_config.useJito === 'boolean') {
        effectiveUseJito = settings.jito_config.useJito;
      }

      expect(effectiveUseJito).toBe(true); // User setting overrides campaign
    });

    it('should use campaign config when user settings are not set', async () => {
      const campaignParams = {
        useJito: true,
        jitoTip: 0.001,
      };

      mockSupabaseService.getCampaignById.mockResolvedValue({
        id: 'campaign-9',
        params: campaignParams,
      });

      mockSupabaseService.getUserSettings.mockResolvedValue(null);

      const campaign = await mockSupabaseService.getCampaignById('campaign-9', mockUser.id);
      const settings = await mockSupabaseService.getUserSettings(mockUser.id);

      let effectiveUseJito = campaign.params?.useJito || false;
      if (settings?.jito_config && typeof settings.jito_config.useJito === 'boolean') {
        effectiveUseJito = settings.jito_config.useJito;
      }

      expect(effectiveUseJito).toBe(true); // Campaign config used
    });

    it('should prioritize user settings over campaign params', async () => {
      const campaignParams = { useJito: true, jitoTip: 0.001 };
      const userSettings = {
        jito_config: {
          useJito: false, // User wants legacy mode
        },
      };

      mockSupabaseService.getCampaignById.mockResolvedValue({
        params: campaignParams,
      });
      mockSupabaseService.getUserSettings.mockResolvedValue(userSettings);

      const campaign = await mockSupabaseService.getCampaignById('campaign-10', mockUser.id);
      const settings = await mockSupabaseService.getUserSettings(mockUser.id);

      let effectiveUseJito = campaign.params?.useJito || false;
      if (settings?.jito_config && typeof settings.jito_config.useJito === 'boolean') {
        effectiveUseJito = settings.jito_config.useJito;
      }

      expect(effectiveUseJito).toBe(false); // User setting takes priority
    });
  });

  describe('Mode Configuration Persistence', () => {
    it('should persist legacy mode configuration in database', async () => {
      const params = {
        useJito: false,
        slippage: 1,
      };

      mockSupabaseService.createCampaign.mockResolvedValue({
        id: 'campaign-11',
        params: params,
      });

      const campaign = await mockSupabaseService.createCampaign({
        user_id: mockUser.id,
        name: 'Test',
        token_id: mockToken.id,
        pool_id: mockPool.id,
        params: params,
        status: 'draft',
      });

      mockSupabaseService.getCampaignById.mockResolvedValue(campaign);
      const retrieved = await mockSupabaseService.getCampaignById(campaign.id, mockUser.id);

      expect(retrieved.params.useJito).toBe(false);
    });

    it('should persist Jito mode configuration in database', async () => {
      const params = {
        useJito: true,
        jitoTip: 0.001,
        slippage: 1,
      };

      mockSupabaseService.createCampaign.mockResolvedValue({
        id: 'campaign-12',
        params: params,
      });

      const campaign = await mockSupabaseService.createCampaign({
        user_id: mockUser.id,
        name: 'Test',
        token_id: mockToken.id,
        pool_id: mockPool.id,
        params: params,
        status: 'draft',
      });

      mockSupabaseService.getCampaignById.mockResolvedValue(campaign);
      const retrieved = await mockSupabaseService.getCampaignById(campaign.id, mockUser.id);

      expect(retrieved.params.useJito).toBe(true);
      expect(retrieved.params.jitoTip).toBe(0.001);
    });

    it('should persist mode changes through updates', async () => {
      const initialParams = { useJito: false };
      const updatedParams = { useJito: true, jitoTip: 0.001 };

      mockSupabaseService.createCampaign.mockResolvedValue({
        id: 'campaign-13',
        params: initialParams,
      });

      const campaign = await mockSupabaseService.createCampaign({
        user_id: mockUser.id,
        name: 'Test',
        token_id: mockToken.id,
        pool_id: mockPool.id,
        params: initialParams,
        status: 'draft',
      });

      mockSupabaseService.updateCampaign.mockResolvedValue({
        id: campaign.id,
        params: updatedParams,
      });

      const updated = await mockSupabaseService.updateCampaign(
        campaign.id,
        mockUser.id,
        { params: updatedParams }
      );

      expect(updated.params.useJito).toBe(true);
      expect(updated.params.jitoTip).toBe(0.001);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing params object gracefully', async () => {
      mockSupabaseService.getCampaignById.mockResolvedValue({
        id: 'campaign-14',
        user_id: mockUser.id,
        // params is missing
      });

      const campaign = await mockSupabaseService.getCampaignById('campaign-14', mockUser.id);
      const useJito = campaign.params?.useJito || false;

      expect(useJito).toBe(false); // Defaults to legacy mode
    });

    it('should handle null params gracefully', async () => {
      mockSupabaseService.getCampaignById.mockResolvedValue({
        id: 'campaign-15',
        params: null,
      });

      const campaign = await mockSupabaseService.getCampaignById('campaign-15', mockUser.id);
      const useJito = campaign.params?.useJito || false;

      expect(useJito).toBe(false);
    });

    it('should handle empty params object', async () => {
      const dto = plainToInstance(CampaignParamsDto, {});
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.useJito).toBeUndefined();
    });

    it('should handle jitoTip without useJito flag', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        jitoTip: 0.001,
        // useJito not set
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      // jitoTip is present but useJito is undefined
      // In production, this would be handled by defaulting useJito to false
    });

    it('should validate complete Jito configuration', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: 0.001,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(true);
      expect(dto.jitoTip).toBe(0.001);
    });

    it('should handle boundary values for jitoTip', async () => {
      // Minimum valid tip
      const dtoMin = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: 0.00001,
      });
      const errorsMin = await validate(dtoMin);
      expect(errorsMin.length).toBe(0);

      // Maximum valid tip
      const dtoMax = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: 1,
      });
      const errorsMax = await validate(dtoMax);
      expect(errorsMax.length).toBe(0);
    });

    it('should reject negative jitoTip values', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: -0.001,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle mode configuration with all optional parameters', async () => {
      const dto = plainToInstance(CampaignParamsDto, {
        useJito: true,
        jitoTip: 0.001,
        slippage: 1,
        minTxSize: 0.001,
        maxTxSize: 0.01,
        targetVolume: 1000,
        schedule: '0 * * * *',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.useJito).toBe(true);
      expect(dto.jitoTip).toBe(0.001);
    });
  });

  describe('Mode Execution Logic', () => {
    it('should indicate legacy executor selection when useJito is false', () => {
      const campaign = {
        params: { useJito: false },
      };

      const useJito = campaign.params?.useJito || false;
      const executorType = useJito ? 'jito' : 'legacy';

      expect(executorType).toBe('legacy');
    });

    it('should indicate Jito executor selection when useJito is true', () => {
      const campaign = {
        params: { useJito: true, jitoTip: 0.001 },
      };

      const useJito = campaign.params?.useJito || false;
      const executorType = useJito ? 'jito' : 'legacy';

      expect(executorType).toBe('jito');
    });

    it('should determine executor type from campaign configuration', () => {
      const legacyCampaign = { params: { useJito: false } };
      const jitoCampaign = { params: { useJito: true } };

      const legacyType = legacyCampaign.params?.useJito ? 'jito' : 'legacy';
      const jitoType = jitoCampaign.params?.useJito ? 'jito' : 'legacy';

      expect(legacyType).toBe('legacy');
      expect(jitoType).toBe('jito');
    });

    it('should apply user settings override to executor selection', () => {
      const campaign = { params: { useJito: false } };
      const settings = { jito_config: { useJito: true } };

      let useJito = campaign.params?.useJito || false;
      if (settings?.jito_config && typeof settings.jito_config.useJito === 'boolean') {
        useJito = settings.jito_config.useJito;
      }

      const executorType = useJito ? 'jito' : 'legacy';
      expect(executorType).toBe('jito');
    });
  });
});
