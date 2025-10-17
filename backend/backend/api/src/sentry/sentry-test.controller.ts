import { Controller, Get, Post, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SentryService } from './sentry.service';

/**
 * Test controller for Sentry integration
 * NOTE: Remove this controller in production or protect it with authentication
 */
@ApiTags('Sentry Test')
@Controller('sentry-test')
export class SentryTestController {
  constructor(private readonly sentryService: SentryService) {}

  @Get('test-message')
  @ApiOperation({ summary: 'Test Sentry message capture' })
  @ApiResponse({ status: 200, description: 'Message sent to Sentry' })
  testMessage() {
    this.sentryService.captureMessage('Test message from API endpoint', 'info', {
      endpoint: '/sentry-test/test-message',
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: 'Test message sent to Sentry. Check your Sentry dashboard.',
    };
  }

  @Get('test-error-400')
  @ApiOperation({ summary: 'Test 4xx error (should NOT be sent to Sentry)' })
  @ApiResponse({ status: 400, description: 'Bad request error' })
  testClientError() {
    // 4xx errors are not sent to Sentry by default (client errors)
    throw new BadRequestException('This is a test 400 error - should NOT appear in Sentry');
  }

  @Get('test-error-500')
  @ApiOperation({ summary: 'Test 5xx error (should be sent to Sentry)' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  testServerError() {
    // 5xx errors ARE sent to Sentry (server errors)
    throw new InternalServerErrorException('This is a test 500 error - should appear in Sentry');
  }

  @Get('test-uncaught')
  @ApiOperation({ summary: 'Test uncaught exception (should be sent to Sentry)' })
  @ApiResponse({ status: 500, description: 'Uncaught exception' })
  testUncaughtError() {
    // Uncaught errors are automatically sent to Sentry
    throw new Error('This is a test uncaught exception - should appear in Sentry');
  }

  @Post('test-context')
  @ApiOperation({ summary: 'Test error with custom context' })
  @ApiResponse({ status: 500, description: 'Error with custom context' })
  testErrorWithContext() {
    // Add breadcrumbs
    this.sentryService.addBreadcrumb({
      type: 'user',
      category: 'action',
      message: 'User triggered test error',
      level: 'info',
      data: {
        action: 'test-error',
        timestamp: Date.now(),
      },
    });

    // Set user context
    this.sentryService.setUser({
      id: 'test-user-123',
      email: 'test@example.com',
      username: 'test_user',
    });

    // Set custom tags
    this.sentryService.setTag('test_type', 'context_test');
    this.sentryService.setTag('endpoint', '/sentry-test/test-context');

    // Set custom context
    this.sentryService.setContext('test_data', {
      test_id: 'test-context-001',
      feature: 'sentry_integration',
      timestamp: new Date().toISOString(),
    });

    throw new Error('Test error with custom context - check Sentry for breadcrumbs, user, tags, and context');
  }

  @Get('test-transaction')
  @ApiOperation({ summary: 'Test performance transaction' })
  @ApiResponse({ status: 200, description: 'Transaction completed' })
  async testTransaction() {
    const transaction = this.sentryService.startTransaction({
      op: 'http.server',
      name: 'Test Transaction',
      data: {
        endpoint: '/sentry-test/test-transaction',
      },
    });

    try {
      // Simulate some work
      const span1 = transaction?.startChild({
        op: 'database',
        description: 'Simulated database query',
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      span1?.finish();

      const span2 = transaction?.startChild({
        op: 'external',
        description: 'Simulated external API call',
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      span2?.finish();

      transaction?.setStatus('ok');
      return {
        success: true,
        message: 'Transaction completed. Check Sentry Performance dashboard.',
      };
    } catch (error) {
      transaction?.setStatus('internal_error');
      throw error;
    } finally {
      transaction?.finish();
    }
  }
}
