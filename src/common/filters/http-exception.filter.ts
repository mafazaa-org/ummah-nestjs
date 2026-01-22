import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { appendFileSync } from 'fs';
import { join } from 'path';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // #region agent log
    try {
      const logPath = join(process.cwd(), '.cursor', 'debug.log');
      appendFileSync(
        logPath,
        JSON.stringify({
          location: 'http-exception.filter.ts:18',
          message: 'Exception filter hit',
          data: {
            method: request.method,
            path: request.path,
            url: request.url,
            exceptionType:
              exception instanceof HttpException ? 'HttpException' : 'Unknown',
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'H',
        }) + '\n',
      );
    } catch (e) {}
    // #endregion

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'خطأ داخلي في الخادم';

    const errorResponse: any = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'string' ? message : (message as any).message,
    };

    // في وضع التطوير، أضف تفاصيل الخطأ
    if (
      process.env.NODE_ENV === 'development' &&
      !(exception instanceof HttpException)
    ) {
      errorResponse.error = (exception as Error).message;
      errorResponse.stack = (exception as Error).stack;
    }

    // CRITICAL: Add CORS headers to error responses
    // Use response.header() which is Express's method for setting headers
    // Must be called BEFORE response.status().json()
    response.header('Access-Control-Allow-Origin', '*');
    response.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    );
    response.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept, X-Requested-With',
    );

    // #region agent log
    try {
      const logPath = join(process.cwd(), '.cursor', 'debug.log');
      appendFileSync(
        logPath,
        JSON.stringify({
          location: 'http-exception.filter.ts:48',
          message: 'CORS headers set in filter before response',
          data: {
            hasOrigin: response.hasHeader('Access-Control-Allow-Origin'),
            status,
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'I',
        }) + '\n',
      );
    } catch (e) {}
    // #endregion

    // Send response - Express should include headers set above
    response.status(status).json(errorResponse);
  }
}
