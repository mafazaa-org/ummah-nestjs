import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { UpdateAuthCodeDto } from './dto/update-auth-code.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { File } from 'multer';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CodeGeneratorUtil } from '../utils/code-generator.util';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    try {
      // Find user by auth code
      const user = await this.usersService.findByAuthCode(loginDto.authCode);
      if (!user) {
        throw new UnauthorizedException('رمز المصادقة غير صحيح');
      }

      // Check if user is active
      if (!(user as any).isActive) {
        throw new UnauthorizedException('الحساب معطل');
      }

      const userId = (user as any)._id?.toString();

      const payload = {
        userId: userId,
        username: user.username,
        authCode: user.authCode,
      };

      const secret = this.configService.get<string>('JWT_SECRET');
      const refreshSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET') || secret;
      if (!secret) {
        throw new BadRequestException('JWT_SECRET غير موجود في ملف .env');
      }

      // Access token: short-lived (1 hour)
      const accessTokenExpires = '1h';
      const accessToken = this.jwtService.sign(payload, {
        secret,
        expiresIn: accessTokenExpires,
      });

      // Refresh token: long-lived (30 days)
      const refreshTokenExpires = '30d';
      const refreshTokenPayload = {
        userId: userId,
        username: user.username,
        type: 'refresh',
      };
      const refreshToken = this.jwtService.sign(refreshTokenPayload, {
        secret: refreshSecret,
        expiresIn: refreshTokenExpires,
      });

      // Store refresh token in user document
      await this.usersService.update(userId, { refreshToken });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          _id: (user as any)._id,
          id: (user as any)._id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
        },
        message: 'تم تسجيل الدخول بنجاح',
      };
    } catch (error) {
      console.error('[AuthService] Login error:', error);
      throw error;
    }
  }

  async register(createUserDto: CreateUserDto) {
    try {
      // Generate unique 70-character auth code using timestamp to ensure uniqueness
      const authCode = CodeGeneratorUtil.generateUniqueCode();

      if (!authCode) {
        throw new BadRequestException('فشل في توليد رمز مصادقة فريد');
      }

      // Create user with the generated auth code
      const user = await this.usersService.create({
        ...createUserDto,
        authCode: authCode,
      });

      const userDoc = user as any;
      const userId = userDoc._id?.toString() || userDoc.id?.toString();

      if (!userId) {
        throw new BadRequestException('فشل في إنشاء المستخدم');
      }

      // Generate JWT tokens (access + refresh)
      const payload = {
        userId: userId,
        username: user.username,
        authCode: authCode,
      };

      const secret = this.configService.get<string>('JWT_SECRET');
      const refreshSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET') || secret;
      if (!secret) {
        throw new BadRequestException('JWT_SECRET غير موجود في ملف .env');
      }

      // Access token: short-lived (1 hour)
      const accessTokenExpires = '1h';
      const accessToken = this.jwtService.sign(payload, {
        secret,
        expiresIn: accessTokenExpires,
      });

      // Refresh token: long-lived (30 days)
      const refreshTokenExpires = '30d';
      const refreshTokenPayload = {
        userId: userId,
        username: user.username,
        type: 'refresh',
      };
      const refreshToken = this.jwtService.sign(refreshTokenPayload, {
        secret: refreshSecret,
        expiresIn: refreshTokenExpires,
      });

      // Store refresh token in user document
      await this.usersService.update(userId, { refreshToken });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          _id: userDoc._id || userDoc.id,
          id: userDoc._id || userDoc.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
        },
        authCode: authCode, // Return the auth code to show in popup
        message: 'تم التسجيل بنجاح! احفظ رمز المصادقة الخاص بك',
      };
    } catch (error) {
      // إعادة رمي الخطأ إذا كان من نوع HttpException
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      // خطأ غير متوقع
      console.error('Register error:', error);
      throw new BadRequestException(
        'فشل في التسجيل: ' + (error.message || 'خطأ غير معروف'),
      );
    }
  }

  async verifyToken(token: string) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      return this.jwtService.verify(token, { secret });
    } catch (error) {
      throw new UnauthorizedException('رمز غير صحيح أو منتهي الصلاحية');
    }
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findOne(userId);
    return {
      _id: (user as any)._id,
      id: (user as any)._id, // للتوافق مع الكود القديم
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
    };
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
    avatar?: File,
  ) {
    try {
      const user = await this.usersService.findOne(userId);
      if (!user) {
        throw new BadRequestException('المستخدم غير موجود');
      }

      // Handle avatar upload if provided
      let avatarPath: string | undefined;
      if (avatar) {
        // Validate file type
        if (!avatar.mimetype.startsWith('image/')) {
          throw new BadRequestException('يجب أن تكون الصورة من نوع صورة صحيح');
        }

        // Validate file size (max 5MB)
        if (avatar.size > 5 * 1024 * 1024) {
          throw new BadRequestException(
            'حجم الصورة يجب أن يكون أقل من 5 ميجابايت',
          );
        }

        // Create uploads directory if it doesn't exist
        const uploadsDir = join(process.cwd(), 'uploads', 'avatars');
        if (!existsSync(uploadsDir)) {
          mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const fileExtension = avatar.originalname.split('.').pop();
        const fileName = `avatar_${userId}_${Date.now()}.${fileExtension}`;
        avatarPath = `/uploads/avatars/${fileName}`;

        // Move file to uploads directory
        const fs = require('fs').promises;
        await fs.writeFile(join(uploadsDir, fileName), avatar.buffer);
      }

      // Check for username uniqueness if username is being updated
      if (
        updateProfileDto.username &&
        updateProfileDto.username !== user.username
      ) {
        const existingUser = await this.usersService.findByUsername(
          updateProfileDto.username,
        );
        if (existingUser && (existingUser as any)._id.toString() !== userId) {
          throw new ConflictException('اسم المستخدم مستخدم بالفعل');
        }
      }

      // Prepare update data
      const updateData: any = { ...updateProfileDto };
      if (avatarPath) {
        updateData.avatar = avatarPath;
      }

      // Update user
      const updatedUser = await this.usersService.update(userId, updateData);

      // Return updated profile
      return {
        _id: (updatedUser as any)._id,
        id: (updatedUser as any)._id,
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        avatar: updatedUser.avatar,
        message: 'تم تحديث الملف الشخصي بنجاح',
      };
    } catch (error) {
      console.error('[AuthService] Update profile error:', error);
      throw error;
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const refreshSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        this.configService.get<string>('JWT_SECRET');

      if (!refreshSecret) {
        throw new BadRequestException('JWT_SECRET غير موجود في ملف .env');
      }

      // Verify refresh token
      const decoded = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Find user and verify refresh token matches
      const user = await this.usersService.findOne(decoded.userId);
      if (!user || (user as any).refreshToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const payload = {
        userId: (user as any)._id.toString(),
        username: user.username,
        authCode: user.authCode,
      };

      // New access token
      const accessToken = this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '1h',
      });

      // New refresh token
      const refreshTokenPayload = {
        userId: (user as any)._id.toString(),
        username: user.username,
        type: 'refresh',
      };
      const newRefreshToken = this.jwtService.sign(refreshTokenPayload, {
        secret: refreshSecret,
        expiresIn: '30d',
      });

      // Update stored refresh token
      await this.usersService.update((user as any)._id.toString(), {
        refreshToken: newRefreshToken,
      });

      return {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        user: {
          _id: (user as any)._id,
          id: (user as any)._id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
        },
        message: 'تم تجديد الجلسة بنجاح',
      };
    } catch (error) {
      console.error('[AuthService] Refresh token error:', error);
      throw new UnauthorizedException('فشل في تجديد الجلسة');
    }
  }

  async updateAuthCode(userId: string, updateAuthCodeDto: any) {
    try {
      console.log(`[AuthService] Updating auth code for user: ${userId}`);

      let newAuthCode: string;

      if (updateAuthCodeDto.customCode) {
        // Use custom code provided by user
        newAuthCode = updateAuthCodeDto.customCode;
        console.log(
          `[AuthService] Using custom auth code: ${newAuthCode.substring(0, 10)}...`,
        );
      } else {
        // Generate random code
        newAuthCode = CodeGeneratorUtil.generateUniqueCode();
        console.log(
          `[AuthService] Generated random auth code: ${newAuthCode.substring(0, 10)}...`,
        );
      }

      // Check if the code is already in use
      const existingUser = await this.usersService.findByAuthCode(newAuthCode);
      if (existingUser && (existingUser as any)._id.toString() !== userId) {
        throw new ConflictException('رمز المصادقة مستخدم بالفعل من مستخدم آخر');
      }

      // Update user's auth code
      await this.usersService.update(userId, { authCode: newAuthCode });

      console.log(
        `[AuthService] Auth code updated successfully for user: ${userId}`,
      );

      return {
        message: 'تم تحديث رمز المصادقة بنجاح',
        newAuthCode: newAuthCode,
        type: updateAuthCodeDto.customCode ? 'custom' : 'random',
      };
    } catch (error) {
      console.error('[AuthService] Update auth code error:', error);
      throw error;
    }
  }
}
