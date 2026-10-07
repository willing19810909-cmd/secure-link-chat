import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { AuthService } from '../auth/auth.service';
import type {
  SendMessageRequest,
  MessageItem,
  MessageListResponse,
  RecallMessageRequest,
} from '@shared/api.interface';

@Controller('api/messages')
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly authService: AuthService,
  ) {}

  private getUserId(authHeader: string | undefined): string {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new HttpException('未登录', HttpStatus.UNAUTHORIZED);
    }
    const userId = this.authService.verifyToken(token);
    if (!userId) {
      throw new HttpException('Token 无效', HttpStatus.UNAUTHORIZED);
    }
    return userId;
  }

  @Post()
  async sendMessage(
    @Headers('authorization') authHeader: string,
    @Body() body: SendMessageRequest,
  ): Promise<MessageItem> {
    try {
      const userId = this.getUserId(authHeader);
      return await this.messageService.sendMessage(
        userId,
        body.receiverId,
        body.msgType,
        body.encryptedContent,
        body.iv,
      );
    } catch (error) {
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async getMessages(
    @Headers('authorization') authHeader: string,
    @Query('friendId') friendId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<MessageListResponse> {
    const userId = this.getUserId(authHeader);
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.messageService.getMessages(userId, friendId, limitNum, cursor);
  }

  @Post('read')
  async markAsRead(
    @Headers('authorization') authHeader: string,
    @Body() body: { friendId: string },
  ): Promise<void> {
    const userId = this.getUserId(authHeader);
    await this.messageService.markAsRead(userId, body.friendId);
  }

  @Post('recall')
  async recallMessage(
    @Headers('authorization') authHeader: string,
    @Body() body: RecallMessageRequest,
  ): Promise<void> {
    try {
      const userId = this.getUserId(authHeader);
      await this.messageService.recallMessage(body.messageId, userId);
    } catch (error) {
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
