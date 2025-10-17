import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract the request ID from the request object
 * Usage: @RequestId() requestId: string
 */
export const RequestId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.requestId || '';
  },
);
