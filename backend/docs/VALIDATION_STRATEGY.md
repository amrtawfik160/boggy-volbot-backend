# Input Validation and Sanitization Strategy

## Overview

This document outlines the comprehensive input validation and sanitization strategy implemented across the Solana Volume Bot application to prevent common security vulnerabilities such as injection attacks, XSS, and invalid data processing.

## Backend Validation (NestJS + class-validator)

### Global Validation Pipe

All API endpoints use a global ValidationPipe configured in `backend/api/src/main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip properties that don't have decorators
    forbidNonWhitelisted: true, // Throw errors if non-whitelisted properties are present
    transform: true, // Automatically transform payloads to DTO instances
    transformOptions: {
      enableImplicitConversion: true, // Allow implicit type conversion
    },
  }),
);
```

**Security Benefits:**
- **whitelist**: Automatically removes any properties not explicitly defined in DTOs, preventing mass assignment vulnerabilities
- **forbidNonWhitelisted**: Rejects requests with unexpected properties, alerting developers to potential attacks
- **transform**: Ensures type safety by converting incoming data to the expected types

### Custom Validators

#### Solana Address Validator
**Location:** `backend/api/src/common/validators/is-solana-address.validator.ts`

Validates Solana public key addresses:
- **Format**: Base58-encoded string
- **Length**: 32-44 characters
- **Character set**: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
- **Verification**: Decodes to exactly 32 bytes

#### Solana Private Key Validator
**Location:** `backend/api/src/common/validators/is-solana-private-key.validator.ts`

Validates Solana keypairs:
- **Format**: Base58-encoded string
- **Length**: 87-88 characters
- **Character set**: Base58 alphabet
- **Verification**: Decodes to exactly 64 bytes (32-byte private key + 32-byte public key)

### Data Transfer Objects (DTOs)

All API endpoints use strongly-typed DTOs with class-validator decorators:

#### Campaign DTOs
**Location:** `backend/api/src/v1/campaigns/dto/`

- **CreateCampaignDto**: Validates campaign creation
  - `name`: Required, non-empty string
  - `token_id`: Valid UUID
  - `pool_id`: Valid Solana address
  - `params`: Nested validation for campaign parameters

- **CampaignParamsDto**: Validates campaign-specific parameters
  - `slippage`: 0-100%
  - `minTxSize`: 0.00001-100 SOL
  - `maxTxSize`: 0.00001-1000 SOL
  - `jitoTip`: 0.00001-1 SOL (when Jito is enabled)

- **DistributeDto**: Validates distribution operations
  - `num_wallets`: Integer, 1-100

- **SellOnlyDto**: Validates sell-only operations
  - `total_times`: Integer, 1-20

#### Wallet DTOs
**Location:** `backend/api/src/v1/wallets/dto/`

- **CreateWalletDto**: Validates wallet creation
  - Either `address` (Solana address) OR `privateKey` (Solana private key) required
  - `label`: Optional, max 255 characters

- **UpdateWalletDto**: Validates wallet updates
  - `label`: Optional string
  - `is_active`: Optional boolean

#### Token DTOs
**Location:** `backend/api/src/v1/tokens/dto/`

- **CreateTokenDto**: Validates token creation
  - `mint`: Valid Solana address
  - `symbol`: Required, transformed to uppercase
  - `decimals`: Integer, 0-18
  - `metadata`: Optional JSONB

- **CreatePoolDto**: Validates pool creation
  - `pool_address`: Valid Solana address
  - `dex`: Enum ['raydium', 'orca', 'jupiter', 'other']
  - `metadata`: Optional JSONB

### Jito Configuration Validation
**Location:** `backend/api/src/v1/settings/dto/jito-config.dto.ts`

- **jitoKey**: Required when `useJito=true`, validated as Solana private key
- **blockEngineUrl**: Valid HTTPS URL
- **jitoFee**: 0.00001-1 SOL
- **bundleTransactionLimit**: 1-5 transactions
- **bundleTimeoutMs**: 5000-60000 ms

## Frontend Validation (Zod)

### Zod Schemas

All frontend forms use Zod schemas that mirror backend validation:

**Location:** `frontend/lib/validations/`

#### Solana Validation
```typescript
// Solana address validation
solanaAddressSchema: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)

// Solana private key validation
solanaPrivateKeySchema: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)
```

#### Campaign Validation
- **createCampaignSchema**: Mirrors CreateCampaignDto
- **campaignParamsSchema**: Includes custom refinement to ensure `minTxSize <= maxTxSize`
- **distributeSchema**: Validates num_wallets (1-100)
- **sellOnlySchema**: Validates total_times (1-20)

#### Wallet Validation
- **createWalletSchema**: Ensures either address OR privateKey is provided
- **updateWalletSchema**: Validates optional label and is_active fields

#### Token Validation
- **createTokenSchema**: Validates mint address, symbol (auto-uppercase), and decimals
- **createPoolSchema**: Validates pool address and DEX enum
- **updateTokenSchema**: Validates optional symbol and metadata

### Integration with React Hook Form

Zod schemas integrate with `react-hook-form` using `@hookform/resolvers`:

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCampaignSchema } from '@/lib/validations';

const form = useForm({
  resolver: zodResolver(createCampaignSchema),
  defaultValues: { /* ... */ },
});
```

## Input Sanitization

### Backend Sanitization

1. **Automatic Property Stripping** (via `whitelist: true`)
   - Removes all properties not defined in DTOs
   - Prevents injection of unexpected data

2. **Type Transformation** (via `transform: true`)
   - Converts strings to numbers/booleans as needed
   - Ensures type safety throughout the application

3. **String Trimming**
   - All string fields in DTOs use `.transform((val) => val.trim())`
   - Removes leading/trailing whitespace
   - Prevents whitespace-based bypasses

4. **Enum Validation**
   - Fields like `dex` use strict enum validation
   - Prevents arbitrary string injection

5. **Base58 Validation**
   - Custom validators ensure only valid Base58 characters
   - Prevents injection via malformed addresses/keys

### Frontend Sanitization

1. **Zod Transform Functions**
   - `.trim()` applied to string inputs
   - `.toUpperCase()` for token symbols
   - Automatic type coercion for numbers

2. **Input Constraints**
   - HTML `min`, `max`, `step` attributes
   - `maxLength` on text inputs
   - Type-specific inputs (number, text, checkbox)

## Error Handling

### Backend Error Responses

ValidationPipe automatically returns HTTP 400 Bad Request with detailed error messages:

```json
{
  "statusCode": 400,
  "message": [
    "slippage must not be greater than 100",
    "Address must be a valid Solana public key (base58-encoded, 32 bytes)"
  ],
  "error": "Bad Request"
}
```

### Frontend Error Display

- Zod validation errors are captured by react-hook-form
- Displayed inline below form fields
- User-friendly error messages guide corrections

## Security Considerations

### Prevented Attack Vectors

1. **SQL Injection**: N/A (using Supabase ORM, parameterized queries)
2. **NoSQL Injection**: Prevented by strict DTO validation
3. **XSS (Cross-Site Scripting)**:
   - Input sanitization via whitelist
   - React's automatic escaping
   - No `dangerouslySetInnerHTML` usage
4. **Mass Assignment**: Prevented by `whitelist: true` and `forbidNonWhitelisted: true`
5. **Type Confusion**: Prevented by `transform: true` and strong typing
6. **Invalid Solana Addresses**: Custom validators ensure Base58 compliance
7. **Out-of-Range Values**: Min/Max validators on all numeric fields

### Additional Security Measures

1. **Private Key Encryption**
   - Private keys encrypted at rest using user-specific Data Encryption Keys (DEKs)
   - Never logged or exposed in API responses

2. **Authentication**
   - All sensitive endpoints protected by `@UseGuards(SupabaseAuthGuard)`
   - JWT token validation on every request

3. **CORS Configuration**
   - Controlled origin access
   - Credentials enabled only for trusted origins

## Testing Strategy

### Backend Validation Tests

Create unit tests for all DTOs:

```typescript
describe('CreateCampaignDto', () => {
  it('should reject invalid slippage', async () => {
    const dto = plainToClass(CreateCampaignDto, {
      name: 'Test',
      token_id: uuid(),
      pool_id: 'invalid-address',
      params: { slippage: 150 },
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

### Frontend Validation Tests

Test zod schemas independently:

```typescript
describe('createCampaignSchema', () => {
  it('should validate correct campaign data', () => {
    const result = createCampaignSchema.safeParse({
      name: 'My Campaign',
      token_id: 'valid-uuid',
      pool_id: 'valid-solana-address',
      params: { slippage: 1 },
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid slippage', () => {
    const result = createCampaignSchema.safeParse({
      name: 'My Campaign',
      token_id: 'valid-uuid',
      pool_id: 'valid-solana-address',
      params: { slippage: 150 },
    });

    expect(result.success).toBe(false);
  });
});
```

### Integration Tests

Test API endpoints with invalid payloads:

```typescript
it('should return 400 for invalid campaign parameters', async () => {
  const response = await request(app)
    .post('/v1/campaigns')
    .send({
      name: '',
      token_id: 'not-a-uuid',
      pool_id: 'invalid-address',
      params: { slippage: 200 },
    })
    .expect(400);

  expect(response.body.message).toContain('slippage');
});
```

## Maintenance Guidelines

### Adding New Endpoints

1. Create a DTO with class-validator decorators
2. Create corresponding Zod schema
3. Ensure validation rules match between backend and frontend
4. Add unit tests for both DTO and Zod schema
5. Document any custom validators or business logic

### Updating Validation Rules

1. Update both backend DTO and frontend Zod schema
2. Update tests to reflect new rules
3. Document changes in this file
4. Consider backwards compatibility for existing data

### Code Review Checklist

- [ ] All request bodies use DTOs with validation
- [ ] All DTOs have corresponding Zod schemas
- [ ] Sensitive fields (addresses, private keys) use custom validators
- [ ] Numeric fields have min/max constraints
- [ ] String fields are trimmed
- [ ] Enum fields use strict validation
- [ ] Error messages are user-friendly
- [ ] Tests cover edge cases

## References

- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
- [class-validator Documentation](https://github.com/typestack/class-validator)
- [Zod Documentation](https://zod.dev/)
- [React Hook Form + Zod](https://react-hook-form.com/get-started#SchemaValidation)
- [Solana Address Format](https://docs.solana.com/developing/clients/jsonrpc-api#base58-encoding)

---

**Last Updated**: 2025-10-09
**Version**: 1.0.0
