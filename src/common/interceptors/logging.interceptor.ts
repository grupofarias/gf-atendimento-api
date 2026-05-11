import { AsyncLocalStorage } from 'async_hooks';

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

export interface LogContext {
  conversationId?: number;
  messageId?: string;
  requestId?: string;
}

export const logStorage = new AsyncLocalStorage<LogContext>();

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method: string; url: string }>();
    const requestId = Math.random().toString(36).slice(2);
    const start = Date.now();

    return new Observable((subscriber) => {
      logStorage.run({ requestId }, () => {
        next
          .handle()
          .pipe(
            tap(() => {
              this.logger.log(`${req.method} ${req.url} ${Date.now() - start}ms requestId=${requestId}`);
            }),
          )
          .subscribe(subscriber);
      });
    });
  }
}
