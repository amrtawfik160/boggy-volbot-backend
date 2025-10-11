import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SettingsController } from '../settings.controller';
import { SupabaseService } from '../../../services/supabase.service';

describe('SettingsController Integration Tests', () => {
  let controller: SettingsController;
  let supabaseService: SupabaseService;

  const mockUser = { id: 'test-user-123' };

  const mockSupabaseService = {
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
  };

  beforeEach(async () => {
    // Manually instantiate controller with mocked dependencies
    controller = new SettingsController(mockSupabaseService as any);
    supabaseService = mockSupabaseService as any;

    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return user settings when they exist', async () => {
      const mockSettings = {
        user_id: mockUser.id,
        trading_config: { isRandom: true },
        sell_config: { percent: 100 },
        jito_config: { useJito: false },
      };

      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);

      const result = await controller.getSettings(mockUser);

      expect(result).toEqual(mockSettings);
      expect(mockSupabaseService.getUserSettings).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return default settings when user settings do not exist', async () => {
      mockSupabaseService.getUserSettings.mockResolvedValue(null);

      const result = await controller.getSettings(mockUser);

      expect(result).toEqual({
        user_id: mockUser.id,
        trading_config: null,
        sell_config: null,
        jito_config: null,
      });
    });
  });

  describe('updateSettings - Jito Configuration', () => {
    it('should update settings with valid Jito config', async () => {
      const validJitoConfig = {
        jito_config: {
          useJito: true,
          jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
          blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
          jitoFee: 0.0001,
          bundleTransactionLimit: 4,
          bundleTimeoutMs: 30000,
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        ...validJitoConfig,
      });

      const result = await controller.updateSettings(validJitoConfig, mockUser);

      expect(result.jito_config).toEqual(validJitoConfig.jito_config);
      expect(mockSupabaseService.upsertUserSettings).toHaveBeenCalledWith(mockUser.id, validJitoConfig);
    });

    it('should reject when useJito is true but jitoKey is missing', async () => {
      const invalidConfig = {
        jito_config: {
          useJito: true,
          // Missing jitoKey
        },
      };

      await expect(controller.updateSettings(invalidConfig, mockUser)).rejects.toThrow(BadRequestException);
      expect(mockSupabaseService.upsertUserSettings).not.toHaveBeenCalled();
    });

    it('should accept when useJito is false without jitoKey', async () => {
      const validConfig = {
        jito_config: {
          useJito: false,
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        ...validConfig,
      });

      const result = await controller.updateSettings(validConfig, mockUser);

      expect(result.jito_config.useJito).toBe(false);
      expect(mockSupabaseService.upsertUserSettings).toHaveBeenCalledWith(mockUser.id, validConfig);
    });

    it('should update settings with partial Jito config (defaults will be used)', async () => {
      const partialConfig = {
        jito_config: {
          useJito: true,
          jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
          // Other fields will use defaults
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        ...partialConfig,
      });

      const result = await controller.updateSettings(partialConfig, mockUser);

      expect(result.jito_config.useJito).toBe(true);
      expect(result.jito_config.jitoKey).toBeDefined();
    });

    it('should update only jito_config without affecting other configs', async () => {
      const updateDto = {
        jito_config: {
          useJito: true,
          jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        trading_config: { isRandom: true }, // Should persist
        sell_config: { percent: 100 }, // Should persist
        jito_config: updateDto.jito_config,
      });

      const result = await controller.updateSettings(updateDto, mockUser);

      expect(result.trading_config).toBeDefined();
      expect(result.sell_config).toBeDefined();
      expect(result.jito_config).toEqual(updateDto.jito_config);
    });
  });

  describe('updateSettings - Validation Edge Cases', () => {
    it('should accept custom blockEngineUrl', async () => {
      const config = {
        jito_config: {
          useJito: true,
          jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
          blockEngineUrl: 'https://custom.block-engine.example.com',
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        ...config,
      });

      const result = await controller.updateSettings(config, mockUser);

      expect(result.jito_config.blockEngineUrl).toBe('https://custom.block-engine.example.com');
    });

    it('should accept custom jitoFee within valid range', async () => {
      const config = {
        jito_config: {
          useJito: true,
          jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
          jitoFee: 0.0005,
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        ...config,
      });

      const result = await controller.updateSettings(config, mockUser);

      expect(result.jito_config.jitoFee).toBe(0.0005);
    });

    it('should accept custom bundleTransactionLimit', async () => {
      const config = {
        jito_config: {
          useJito: true,
          jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
          bundleTransactionLimit: 3,
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        ...config,
      });

      const result = await controller.updateSettings(config, mockUser);

      expect(result.jito_config.bundleTransactionLimit).toBe(3);
    });

    it('should accept custom bundleTimeoutMs', async () => {
      const config = {
        jito_config: {
          useJito: true,
          jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
          bundleTimeoutMs: 45000,
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        ...config,
      });

      const result = await controller.updateSettings(config, mockUser);

      expect(result.jito_config.bundleTimeoutMs).toBe(45000);
    });
  });

  describe('updateSettings - Multiple Configs', () => {
    it('should update all configs at once', async () => {
      const fullUpdate = {
        trading_config: {
          isRandom: true,
          buyLowerAmount: 0.001,
          buyUpperAmount: 0.01,
        },
        sell_config: {
          percent: 50,
          sellAllByTimes: 10,
        },
        jito_config: {
          useJito: true,
          jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
          jitoFee: 0.0002,
        },
      };

      mockSupabaseService.upsertUserSettings.mockResolvedValue({
        user_id: mockUser.id,
        ...fullUpdate,
      });

      const result = await controller.updateSettings(fullUpdate, mockUser);

      expect(result.trading_config).toEqual(fullUpdate.trading_config);
      expect(result.sell_config).toEqual(fullUpdate.sell_config);
      expect(result.jito_config).toEqual(fullUpdate.jito_config);
    });
  });
});
