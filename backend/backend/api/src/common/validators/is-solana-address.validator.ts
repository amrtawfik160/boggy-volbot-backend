import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import bs58 from 'bs58';

/**
 * Validator constraint for Solana addresses
 * Validates that a string is a valid Base58-encoded Solana public key
 */
@ValidatorConstraint({ name: 'isSolanaAddress', async: false })
export class IsSolanaAddressConstraint implements ValidatorConstraintInterface {
  validate(address: any, args: ValidationArguments): boolean {
    if (typeof address !== 'string') {
      return false;
    }

    try {
      // Solana addresses are base58 encoded and typically 32-44 characters
      // Base58 character set: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

      if (!base58Regex.test(address)) {
        return false;
      }

      // Attempt to decode base58 to verify it's valid
      const decoded = bs58.decode(address);

      // Solana public keys are 32 bytes
      return decoded.length === 32;
    } catch (error) {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Address must be a valid Solana public key (base58-encoded, 32 bytes)';
  }
}

/**
 * Decorator to validate Solana addresses
 * @param validationOptions - Optional validation options
 *
 * @example
 * ```typescript
 * class CreateWalletDto {
 *   @IsSolanaAddress()
 *   address: string;
 * }
 * ```
 */
export function IsSolanaAddress(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSolanaAddressConstraint,
    });
  };
}
