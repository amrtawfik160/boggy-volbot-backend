import { trace, context, SpanStatusCode } from '@opentelemetry/api';

/**
 * Decorator to automatically create a span for a method
 *
 * Usage:
 * ```typescript
 * @Trace('my-operation')
 * async myMethod(param: string) {
 *   // This method execution will be traced
 * }
 * ```
 *
 * The span name will be: {spanName}:{className}.{methodName}
 * For example: my-operation:CampaignsService.startCampaign
 *
 * Attributes are automatically added:
 * - class: The class name
 * - method: The method name
 * - Any additional attributes passed to the decorator
 */
export function Trace(
  spanName?: string,
  attributes?: Record<string, string | number | boolean>,
): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = String(propertyKey);
    const fullSpanName = spanName
      ? `${spanName}:${className}.${methodName}`
      : `${className}.${methodName}`;

    descriptor.value = async function (...args: any[]) {
      const tracer = trace.getTracer('volume-bot-api');
      const span = tracer.startSpan(fullSpanName, {
        attributes: {
          class: className,
          method: methodName,
          ...attributes,
        },
      });

      try {
        // Run the original method in the span context
        const result = await context.with(
          trace.setSpan(context.active(), span),
          async () => {
            return await originalMethod.apply(this, args);
          },
        );

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    };

    return descriptor;
  };
}

/**
 * Helper function to manually create a span
 *
 * Usage:
 * ```typescript
 * import { withSpan } from './tracing/trace.decorator';
 *
 * const result = await withSpan('my-operation', async (span) => {
 *   span.setAttribute('custom-attr', 'value');
 *   // Do work here
 *   return result;
 * });
 * ```
 */
export async function withSpan<T>(
  spanName: string,
  fn: (span: any) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = trace.getTracer('volume-bot-api');
  const span = tracer.startSpan(spanName, { attributes });

  try {
    const result = await context.with(
      trace.setSpan(context.active(), span),
      async () => {
        return await fn(span);
      },
    );

    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}
