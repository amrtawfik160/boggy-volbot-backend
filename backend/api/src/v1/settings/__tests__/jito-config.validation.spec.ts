import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { JitoConfigDto } from '../dto/jito-config.dto';

describe('JitoConfigDto Validation', () => {
  describe('useJito', () => {
    it('should accept boolean true', async () => {
      const dto = plainToInstance(JitoConfigDto, { useJito: true, jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept boolean false', async () => {
      const dto = plainToInstance(JitoConfigDto, { useJito: false });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-boolean values', async () => {
      const dto = plainToInstance(JitoConfigDto, { useJito: 'yes' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('useJito');
    });

    it('should allow undefined (optional)', async () => {
      const dto = plainToInstance(JitoConfigDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('jitoKey', () => {
    it('should accept valid base58 private key (88 chars)', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        useJito: true,
        jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X'
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid base58 private key (87 chars)', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        useJito: true,
        jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6'
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject jitoKey with invalid characters', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        useJito: true,
        jitoKey: '0OIl' + 'a'.repeat(84) // Contains invalid base58 chars
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const jitoKeyError = errors.find(e => e.property === 'jitoKey');
      expect(jitoKeyError).toBeDefined();
    });

    it('should reject jitoKey that is too short', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        useJito: true,
        jitoKey: 'short'
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const jitoKeyError = errors.find(e => e.property === 'jitoKey');
      expect(jitoKeyError).toBeDefined();
    });

    it('should reject jitoKey that is too long', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        useJito: true,
        jitoKey: 'a'.repeat(100)
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should require jitoKey when useJito is true', async () => {
      const dto = plainToInstance(JitoConfigDto, { useJito: true });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const jitoKeyError = errors.find(e => e.property === 'jitoKey');
      expect(jitoKeyError).toBeDefined();
    });

    it('should not require jitoKey when useJito is false', async () => {
      const dto = plainToInstance(JitoConfigDto, { useJito: false });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('blockEngineUrl', () => {
    it('should accept valid HTTPS URL', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        blockEngineUrl: 'https://mainnet.block-engine.jito.wtf'
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid HTTP URL', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        blockEngineUrl: 'http://localhost:8080'
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid URL format', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        blockEngineUrl: 'not-a-url'
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const urlError = errors.find(e => e.property === 'blockEngineUrl');
      expect(urlError).toBeDefined();
    });

    it('should allow undefined (optional)', async () => {
      const dto = plainToInstance(JitoConfigDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('jitoFee', () => {
    it('should accept valid fee (0.0001)', async () => {
      const dto = plainToInstance(JitoConfigDto, { jitoFee: 0.0001 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept minimum fee (0.00001)', async () => {
      const dto = plainToInstance(JitoConfigDto, { jitoFee: 0.00001 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept maximum fee (1)', async () => {
      const dto = plainToInstance(JitoConfigDto, { jitoFee: 1 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject fee below minimum', async () => {
      const dto = plainToInstance(JitoConfigDto, { jitoFee: 0.000001 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const feeError = errors.find(e => e.property === 'jitoFee');
      expect(feeError).toBeDefined();
    });

    it('should reject fee above maximum', async () => {
      const dto = plainToInstance(JitoConfigDto, { jitoFee: 1.5 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const feeError = errors.find(e => e.property === 'jitoFee');
      expect(feeError).toBeDefined();
    });

    it('should reject non-numeric values', async () => {
      const dto = plainToInstance(JitoConfigDto, { jitoFee: 'free' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('bundleTransactionLimit', () => {
    it('should accept valid limit (4)', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTransactionLimit: 4 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept minimum limit (1)', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTransactionLimit: 1 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept maximum limit (5)', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTransactionLimit: 5 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject limit below minimum', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTransactionLimit: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject limit above maximum', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTransactionLimit: 10 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('bundleTimeoutMs', () => {
    it('should accept valid timeout (30000)', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTimeoutMs: 30000 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept minimum timeout (5000)', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTimeoutMs: 5000 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept maximum timeout (60000)', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTimeoutMs: 60000 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject timeout below minimum', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTimeoutMs: 1000 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject timeout above maximum', async () => {
      const dto = plainToInstance(JitoConfigDto, { bundleTimeoutMs: 120000 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Complete configuration', () => {
    it('should accept valid complete Jito config', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        useJito: true,
        jitoKey: '5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X',
        blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
        jitoFee: 0.0001,
        bundleTransactionLimit: 4,
        bundleTimeoutMs: 30000
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept minimal valid config', async () => {
      const dto = plainToInstance(JitoConfigDto, {
        useJito: false
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty config (all optional)', async () => {
      const dto = plainToInstance(JitoConfigDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});
