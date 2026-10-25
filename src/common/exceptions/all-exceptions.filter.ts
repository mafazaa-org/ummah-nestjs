import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { AppException } from './app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse() as any;
      if (statusCode === HttpStatus.BAD_REQUEST) {
        code = 'VALIDATION_ERROR';
        message = Array.isArray(response?.message) ? response.message.join('; ') : response?.message || 'Bad request';
      } else if (statusCode === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
        message = 'Resource not found';
      } else if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
        code = 'TOO_MANY_REQUESTS';
        message = 'Too many requests, please try again later';
      } else if (statusCode === HttpStatus.PAYLOAD_TOO_LARGE) {
        code = 'PAYLOAD_TOO_LARGE';
        message = response?.message || 'Payload too large';
      } else {
        code = response?.code || 'HTTP_ERROR';
        message = response?.message || exception.message;
      }
    } else if (
      (exception as any)?.status === HttpStatus.PAYLOAD_TOO_LARGE ||
      (exception as any)?.statusCode === HttpStatus.PAYLOAD_TOO_LARGE
    ) {
      statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
      code = 'PAYLOAD_TOO_LARGE';
      message = (exception as any)?.message || 'Payload too large';
    } else {
      this.logger.error(
        `Unhandled error processing ${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(statusCode).json({
      statusCode,
      code,
      message,
    });
  }
}
