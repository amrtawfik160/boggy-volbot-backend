import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Don't track metrics for the metrics endpoint itself
    if (req.path === '/metrics') {
      return next();
    }

    const start = Date.now();

    // Hook into the response finish event to record metrics
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      const { method, path } = req;
      const { statusCode } = res;

      // Record request counter
      this.metricsService.httpRequestsCounter.inc({
        method,
        path,
        status: statusCode.toString(),
      });

      // Record request duration
      this.metricsService.httpRequestDuration.observe(
        {
          method,
          path,
          status: statusCode.toString(),
        },
        duration,
      );
    });

    next();
  }
}
