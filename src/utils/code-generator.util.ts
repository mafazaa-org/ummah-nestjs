import { Injectable } from '@nestjs/common';

@Injectable()
export class CodeGeneratorUtil {
  private static readonly CODE_LENGTH = 70;
  private static readonly CHARS =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  /**
   * Generate a unique 70-character random code
   * Uses timestamp + random to ensure uniqueness
   */
  static generateUniqueCode(): string {
    const timestamp = Date.now().toString();
    const randomPartLength = this.CODE_LENGTH - timestamp.length;
    let result = timestamp;

    // Fill remaining characters with random chars
    for (let i = 0; i < randomPartLength; i++) {
      result += this.CHARS.charAt(
        Math.floor(Math.random() * this.CHARS.length),
      );
    }

    return result;
  }

  /**
   * Validate that the code is 70 characters long and contains only allowed characters
   */
  static validateCode(code: string): boolean {
    if (code.length !== this.CODE_LENGTH) {
      return false;
    }

    for (let i = 0; i < code.length; i++) {
      if (!this.CHARS.includes(code[i])) {
        return false;
      }
    }

    return true;
  }
}
