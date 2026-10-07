import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  Patch,
  HttpException,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { FriendService } from './friend.service';
import { AuthService } from '../auth/auth.service';
import type {
  FriendItem,
  FriendRequestItem,
  AddFriendRequest,
  UpdateRemarkRequest,
} from '@shared/api.interface';

@Controller('api/friends')
export class FriendController {
  constructor(
    private readonly friendService: FriendService,
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

  @Get()
  async getFriends(
    @Headers('authorization') authHeader: string,
  ): Promise<FriendItem[]> {
    const userId = this.getUserId(authHeader);
    return this.friendService.getFriendList(userId);
  }

  @Post('request')
  async addFriend(
    @Headers('authorization') authHeader: string,
    @Body() body: AddFriendRequest,
  ): Promise<FriendRequestItem> {
    try {
      const userId = this.getUserId(authHeader);
      return await this.friendService.sendRequest(userId, body.idCode);
    } catch (error) {
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('requests')
  async getRequests(
    @Headers('authorization') authHeader: string,
  ): Promise<FriendRequestItem[]> {
    const userId = this.getUserId(authHeader);
    return this.friendService.getPendingRequests(userId);
  }

  @Post('requests/:id/accept')
  async acceptRequest(
    @Headers('authorization') authHeader: string,
    @Param('id') requestId: string,
  ): Promise<void> {
    try {
      const userId = this.getUserId(authHeader);
      await this.friendService.acceptRequest(requestId, userId);
    } catch (error) {
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('requests/:id/reject')
  async rejectRequest(
    @Headers('authorization') authHeader: string,
    @Param('id') requestId: string,
  ): Promise<void> {
    try {
      const userId = this.getUserId(authHeader);
      await this.friendService.rejectRequest(requestId, userId);
    } catch (error) {
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':friendId')
  async deleteFriend(
    @Headers('authorization') authHeader: string,
    @Param('friendId') friendId: string,
  ): Promise<void> {
    const userId = this.getUserId(authHeader);
    await this.friendService.deleteFriend(userId, friendId);
  }

  @Patch('remark')
  async updateRemark(
    @Headers('authorization') authHeader: string,
    @Body() body: UpdateRemarkRequest,
  ): Promise<void> {
    const userId = this.getUserId(authHeader);
    await this.friendService.updateRemark(userId, body.friendId, body.remarkName);
  }
}
