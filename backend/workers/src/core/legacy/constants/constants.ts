import { getEnvOrDefault } from '../../config/env'

// Use optional retrieval with sensible defaults
export const PRIVATE_KEY = process.env.PRIVATE_KEY || ''
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com'
export const RPC_WEBSOCKET_ENDPOINT = process.env.RPC_WEBSOCKET_ENDPOINT || 'wss://api.mainnet-beta.solana.com'

export const IS_RANDOM = getEnvOrDefault('IS_RANDOM', false)
export const SWAP_ROUTING = getEnvOrDefault('SWAP_ROUTING', true)
export const DISTRIBUTION_AMOUNT = getEnvOrDefault('DISTRIBUTION_AMOUNT', 0.01)
export const BUY_AMOUNT = getEnvOrDefault('BUY_AMOUNT', 0.01)
export const BUY_UPPER_AMOUNT = getEnvOrDefault('BUY_UPPER_AMOUNT', 0.02)
export const BUY_LOWER_AMOUNT = getEnvOrDefault('BUY_LOWER_AMOUNT', 0.005)

export const BUY_INTERVAL_MIN = getEnvOrDefault('BUY_INTERVAL_MIN', 2000)
export const BUY_INTERVAL_MAX = getEnvOrDefault('BUY_INTERVAL_MAX', 5000)

export const SELL_ALL_BY_TIMES = getEnvOrDefault('SELL_ALL_BY_TIMES', 1)
export const SELL_PERCENT = getEnvOrDefault('SELL_PERCENT', 100)

export const DISTRIBUTE_WALLET_NUM = getEnvOrDefault('DISTRIBUTE_WALLET_NUM', 5)
export const CHECK_BAL_INTERVAL = getEnvOrDefault('CHECK_BAL_INTERVAL', 3000)

export const WALLET_NUM = getEnvOrDefault('WALLET_NUM', 5)

export const TX_FEE = getEnvOrDefault('TX_FEE', 1)

export const TOKEN_MINT = process.env.TOKEN_MINT || ''
export const POOL_ID = process.env.POOL_ID || ''

export const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

export const ADDITIONAL_FEE = getEnvOrDefault('ADDITIONAL_FEE', 100000)
export const JITO_KEY = process.env.JITO_KEY || ''
export const BLOCKENGINE_URL = process.env.BLOCKENGINE_URL || 'https://mainnet.block-engine.jito.wtf'
export const JITO_FEE = getEnvOrDefault('JITO_FEE', 10000)

export const NATIVE_MINT = 'So11111111111111111111111111111111111111112'
