import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import bs58 from 'bs58';

/**
 * Validator constraint for Solana private keys
 * Validates that a string is a valid Base58-encoded Solana private key (64 bytes)
 */
@ValidatorConstraint({ name: 'isSolanaPrivateKey', async: false })
export class IsSolanaPrivateKeyConstraint implements ValidatorConstraintInterface {
  validate(privateKey: any, args: ValidationArguments): boolean {
    if (typeof privateKey !== 'string') {
      return false;
    }

    try {
      // Solana private keys are base58 encoded and typically 87-88 characters
      // Base58 character set: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;

      if (!base58Regex.test(privateKey)) {
        return false;
      }

      // Attempt to decode base58 to verify it's valid
      const decoded = bs58.decode(privateKey);

      // Solana private keys are 64 bytes (keypair = 32 bytes private + 32 bytes public)
      return decoded.length === 64;
    } catch (error) {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Private key must be a valid Solana keypair (base58-encoded, 64 bytes)';
  }
}

/**
 * Decorator to validate Solana private keys
 * @param validationOptions - Optional validation options
 *
 * @example
 * ```typescript
 * class CreateWalletDto {
 *   @IsSolanaPrivateKey()
 *   @IsOptional()
 *   privateKey?: string;
 * }
 * ```
 */
export function IsSolanaPrivateKey(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSolanaPrivateKeyConstraint,
    });
  };
}
