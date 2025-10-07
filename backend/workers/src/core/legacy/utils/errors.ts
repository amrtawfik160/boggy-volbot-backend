export class BaseError extends Error {
    public override readonly name: string
    public readonly timestamp: Date
    public readonly context: Record<string, unknown> | undefined

    constructor(message: string, context?: Record<string, unknown>) {
        super(message)
        this.name = this.constructor.name
        this.timestamp = new Date()
        this.context = context
        Error.captureStackTrace(this, this.constructor)
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            timestamp: this.timestamp,
            context: this.context,
            stack: this.stack,
        }
    }
}

export class ConfigurationError extends BaseError {}

export class WalletError extends BaseError {}

export class TransactionError extends BaseError {
    public readonly signature: string | undefined
    public readonly retryable: boolean
    constructor(message: string, context?: Record<string, unknown>, signature?: string, retryable: boolean = true) {
        super(`Transaction Error: ${message}`, context)
        this.signature = signature
        this.retryable = retryable
    }
}

export class PoolError extends BaseError {
    public readonly poolId: string | undefined
    constructor(message: string, poolId?: string, context?: Record<string, unknown>) {
        super(`Pool Error: ${message}`, context)
        this.poolId = poolId
    }
}

export class NetworkError extends BaseError {
    public readonly endpoint: string | undefined
    public readonly statusCode: number | undefined
    constructor(message: string, endpoint?: string, statusCode?: number, context?: Record<string, unknown>) {
        super(`Network Error: ${message}`, context)
        this.endpoint = endpoint
        this.statusCode = statusCode
    }
}

export class JupiterError extends BaseError {
    public readonly quoteResponse?: unknown
    constructor(message: string, quoteResponse?: unknown, context?: Record<string, unknown>) {
        super(`Jupiter Error: ${message}`, context)
        this.quoteResponse = quoteResponse
    }
}

export class JitoError extends BaseError {
    public readonly bundleId: string | undefined
    constructor(message: string, bundleId?: string, context?: Record<string, unknown>) {
        super(`Jito Error: ${message}`, context)
        this.bundleId = bundleId
    }
}

export class DistributionError extends BaseError {
    public readonly walletCount: number | undefined
    public readonly totalAmount: number | undefined
    constructor(message: string, walletCount?: number, totalAmount?: number, context?: Record<string, unknown>) {
        super(`Distribution Error: ${message}`, context)
        this.walletCount = walletCount
        this.totalAmount = totalAmount
    }
}

export class ErrorHandler {
    static isRetryableError(error: unknown): boolean {
        if (error instanceof TransactionError) return error.retryable
        if (error instanceof NetworkError) return !error.statusCode || error.statusCode >= 500
        return true
    }

    static getErrorMessage(error: unknown): string {
        if (error instanceof BaseError) return error.message
        if (error instanceof Error) return error.message
        return String(error)
    }

    static getErrorContext(error: unknown): Record<string, unknown> {
        if (error instanceof BaseError) return error.context || {}
        return {}
    }

    static shouldAbort(error: unknown, retryCount: number, maxRetries: number): boolean {
        if (error instanceof ConfigurationError) return true
        if (retryCount >= maxRetries) return true
        if (error instanceof TransactionError && !error.retryable) return true
        return false
    }
}

export class CircuitBreaker {
    private failures: number = 0
    private lastFailTime: number = 0
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
    constructor(
        private threshold: number = 5,
        private timeout: number = 60000
    ) {}
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailTime > this.timeout) {
                this.state = 'HALF_OPEN'
            } else {
                throw new Error('Circuit breaker is OPEN - too many recent failures')
            }
        }
        try {
            const result = await operation()
            this.onSuccess()
            return result
        } catch (error) {
            this.onFailure()
            throw error
        }
    }
    private onSuccess(): void {
        this.failures = 0
        this.state = 'CLOSED'
    }
    private onFailure(): void {
        this.failures++
        this.lastFailTime = Date.now()
        if (this.failures >= this.threshold) this.state = 'OPEN'
    }
    getState(): string {
        return this.state
    }
}

export class RetryHandler {
    static async withRetry<T>(operation: () => Promise<T>, maxRetries: number = 3, baseDelay: number = 1000, maxDelay: number = 10000): Promise<T> {
        let lastError: unknown
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation()
            } catch (error) {
                lastError = error
                if (error instanceof Error && error.message.includes('429')) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt + 2), 30000)
                    console.log(`Rate limited, waiting ${delay}ms before retry...`)
                    await this.sleep(delay)
                    continue
                }
                if (ErrorHandler.shouldAbort(error, attempt, maxRetries)) throw error
                if (attempt < maxRetries) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
                    await this.sleep(delay)
                }
            }
        }
        throw lastError
    }
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
