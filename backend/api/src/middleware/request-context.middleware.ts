import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Middleware to attach a unique request ID to each incoming request
 * The request ID can be used for log correlation and tracing
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use existing request ID from header or generate a new one
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    // Attach request ID to the request object for access in controllers
    (req as any).requestId = requestId;

    // Also set it in the response header for client tracking
    res.setHeader('x-request-id', requestId);

    next();
  }
}
