import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import * as Sentry from '@sentry/node';
import { SentryService } from './sentry.service';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  constructor(private readonly sentryService: SentryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, headers, body, user } = request;

    // Add breadcrumb for the request
    this.sentryService.addBreadcrumb({
      type: 'http',
      category: 'request',
      data: {
        method,
        url,
        user_agent: headers['user-agent'],
      },
      level: 'info',
    });

    // Set user context if available
    if (user) {
      this.sentryService.setUser({
        id: user.id,
        email: user.email,
        username: user.username,
      });
    }

    // Start a transaction for performance monitoring
    const transaction = this.sentryService.startTransaction({
      op: 'http.server',
      name: `${method} ${url}`,
      data: {
        method,
        url,
      },
    });

    return next.handle().pipe(
      tap(() => {
        // Finish transaction on success
        transaction?.finish();
      }),
      catchError((error) => {
        // Finish transaction on error
        transaction?.setStatus('internal_error');
        transaction?.finish();

        // Only capture non-HTTP exceptions or 5xx errors
        if (error instanceof HttpException) {
          const status = error.getStatus();

          // Only log server errors (5xx) to Sentry
          if (status >= 500) {
            this.sentryService.captureException(error, {
              request: {
                method,
                url,
                headers: this.sanitizeHeaders(headers),
                body: this.sanitizeBody(body),
              },
              response: {
                status,
                message: error.message,
              },
            });
          }
        } else {
          // Capture all non-HTTP exceptions
          this.sentryService.captureException(error, {
            request: {
              method,
              url,
              headers: this.sanitizeHeaders(headers),
              body: this.sanitizeBody(body),
            },
          });
        }

        return throwError(() => error);
      }),
    );
  }

  /**
   * Remove sensitive headers
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

    sensitiveHeaders.forEach((header) => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Remove sensitive body fields
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'privateKey', 'secret', 'token', 'apiKey'];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}
