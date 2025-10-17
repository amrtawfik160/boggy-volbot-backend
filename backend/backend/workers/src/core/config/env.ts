/**
 * Environment configuration with optional CLI variables
 * This allows the backend to run without requiring all CLI-specific env vars
 */

export interface EnvConfig {
    // Core Solana config
    rpcEndpoint?: string
    rpcWebsocketEndpoint?: string

    // Trading config
    swapRouting?: boolean
    distributionAmount?: number
    buyAmount?: number
    buyUpperAmount?: number
    buyLowerAmount?: number
    buyIntervalMin?: number
    buyIntervalMax?: number

    // Fees
    txFee?: number
    additionalFee?: number

    // Jito config
    jitoKey?: string
    blockengineUrl?: string
    jitoFee?: number
}

export function loadEnvConfig(): EnvConfig {
    return {
        rpcEndpoint: process.env.RPC_ENDPOINT,
        rpcWebsocketEndpoint: process.env.RPC_WEBSOCKET_ENDPOINT,
        swapRouting: process.env.SWAP_ROUTING === 'true',
        distributionAmount: process.env.DISTRIBUTION_AMOUNT ? Number(process.env.DISTRIBUTION_AMOUNT) : undefined,
        buyAmount: process.env.BUY_AMOUNT ? Number(process.env.BUY_AMOUNT) : undefined,
        buyUpperAmount: process.env.BUY_UPPER_AMOUNT ? Number(process.env.BUY_UPPER_AMOUNT) : undefined,
        buyLowerAmount: process.env.BUY_LOWER_AMOUNT ? Number(process.env.BUY_LOWER_AMOUNT) : undefined,
        buyIntervalMin: process.env.BUY_INTERVAL_MIN ? Number(process.env.BUY_INTERVAL_MIN) : undefined,
        buyIntervalMax: process.env.BUY_INTERVAL_MAX ? Number(process.env.BUY_INTERVAL_MAX) : undefined,
        txFee: process.env.TX_FEE ? Number(process.env.TX_FEE) : undefined,
        additionalFee: process.env.ADDITIONAL_FEE ? Number(process.env.ADDITIONAL_FEE) : undefined,
        jitoKey: process.env.JITO_KEY,
        blockengineUrl: process.env.BLOCKENGINE_URL,
        jitoFee: process.env.JITO_FEE ? Number(process.env.JITO_FEE) : undefined,
    }
}

// Optional retrieval with defaults
export function getEnvOrDefault<T>(key: string, defaultValue: T): T {
    const value = process.env[key]
    if (!value) return defaultValue

    if (typeof defaultValue === 'number') {
        return Number(value) as T
    }
    if (typeof defaultValue === 'boolean') {
        return (value === 'true') as T
    }
    return value as T
}
