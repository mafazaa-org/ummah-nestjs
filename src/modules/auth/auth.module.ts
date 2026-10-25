import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';

@Module({
  controllers: [AuthController],
  providers: [FirebaseService, AuthService],
  exports: [FirebaseService, AuthService],
})
export class AuthModule {}
