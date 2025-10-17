import { Connection, PublicKey } from '@solana/web3.js';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';

export async function getTokenMetadata(connection: Connection, mintAddress: PublicKey) {
  try {
    // First, try to get mint info for decimals
    const mintInfo = await connection.getParsedAccountInfo(mintAddress);
    
    if (!mintInfo.value) {
      throw new Error('Token mint not found');
    }

    const parsedData = (mintInfo.value.data as any).parsed?.info;
    const decimals = parsedData?.decimals || 9;

    // Try to fetch Metaplex metadata
    let symbol = '';
    let name = '';
    let image = '';

    try {
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
          mintAddress.toBuffer(),
        ],
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
      );

      const metadataAccount = await connection.getAccountInfo(metadataPDA);
      
      if (metadataAccount) {
        const metadata = Metadata.deserialize(metadataAccount.data)[0];
        symbol = metadata.data.symbol.replace(/\0/g, '');
        name = metadata.data.name.replace(/\0/g, '');
        
        // Fetch off-chain metadata if URI exists
        if (metadata.data.uri) {
          try {
            const response = await fetch(metadata.data.uri.replace(/\0/g, ''));
            const json = await response.json();
            image = json.image || '';
          } catch {
            // Ignore off-chain metadata fetch errors
          }
        }
      }
    } catch {
      // If Metaplex metadata doesn't exist, use defaults
      symbol = mintAddress.toString().slice(0, 4).toUpperCase();
    }

    return {
      symbol: symbol || 'UNKNOWN',
      decimals,
      name,
      image,
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch token metadata: ${error.message}`);
  }
}

