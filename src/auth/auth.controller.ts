import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Patch,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateAuthCodeDto } from './dto/update-auth-code.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() createUserDto: CreateUserDto) {
    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(process.cwd(), '.cursor', 'debug.log');
      fs.appendFileSync(
        logPath,
        JSON.stringify({
          location: 'auth.controller.ts:12',
          message: 'Register endpoint hit',
          data: { hasBody: !!createUserDto },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'H',
        }) + '\n',
      );
    } catch (e) { }
    // #endregion
    return this.authService.register(createUserDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    try {
      return await this.authService.login(loginDto);
    } catch (error) {
      console.error('[AuthController] Login error:', error);
      throw error;
    }
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  async refresh(@Request() req: any) {
    try {
      const refreshToken = req.body.refreshToken;
      return await this.authService.refreshToken(refreshToken);
    } catch (error) {
      console.error('[AuthController] Refresh token error:', error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any) {
    const profile = await this.authService.getProfile(req.user.userId);
    console.log('📤 Sending profile to frontend:', profile);
    return profile;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @UseInterceptors(FileInterceptor('avatar'))
  async updateProfile(
    @Request() req: any,
    @Body() updateProfileDto: UpdateProfileDto,
    @UploadedFile() avatar?: any,
  ) {
    return this.authService.updateProfile(
      req.user.userId,
      updateProfileDto,
      avatar,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('auth-code')
  async updateAuthCode(
    @Request() req: any,
    @Body() updateAuthCodeDto: UpdateAuthCodeDto,
  ) {
    try {
      return await this.authService.updateAuthCode(
        req.user.userId,
        updateAuthCodeDto,
      );
    } catch (error) {
      console.error('[AuthController] Update auth code error:', error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify')
  verifyToken(@Request() req: any) {
    return { valid: true, user: req.user };
  }
}
