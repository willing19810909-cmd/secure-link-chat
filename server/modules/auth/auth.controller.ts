import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  HttpException,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  ChatUser,
} from '@shared/api.interface';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterRequest): Promise<RegisterResponse> {
    try {
      return await this.authService.register(
        body.username,
        body.password,
        body.publicKey,
        body.encryptedPrivateKey,
      );
    } catch (error) {
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('login')
  async login(@Body() body: LoginRequest): Promise<LoginResponse> {
    try {
      return await this.authService.login(body.idCode, body.password);
    } catch (error) {
      throw new HttpException(
        (error as Error).message,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Get('me')
  async getMe(@Headers('authorization') authHeader: string): Promise<ChatUser> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new HttpException('未登录', HttpStatus.UNAUTHORIZED);
    }
    const userId = this.authService.verifyToken(token);
    if (!userId) {
      throw new HttpException('Token 无效', HttpStatus.UNAUTHORIZED);
    }
    const user = await this.authService.getUserById(userId);
    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }
    return user;
  }
}
