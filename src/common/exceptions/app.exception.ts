import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
  ) {
    super({ statusCode: status, code, message }, status);
  }
}
