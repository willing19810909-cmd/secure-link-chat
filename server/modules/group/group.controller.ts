import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GroupService } from './group.service';
import { AuthService } from '../auth/auth.service';
import type {
  CreateGroupRequest,
  ChatGroup,
  GroupItem,
  GroupMember,
  InviteMemberRequest,
  SendGroupMessageRequest,
  GroupMessageItem,
  GroupMessageListResponse,
  GroupRecallMessageRequest,
} from '@shared/api.interface';

@Controller('api/group')
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
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

  @Post('create')
  async createGroup(
    @Headers('authorization') authHeader: string,
    @Body() body: CreateGroupRequest,
  ): Promise<ChatGroup> {
    try {
      const userId = this.getUserId(authHeader);
      return await this.groupService.createGroup(
        userId,
        body.name,
        body.memberIds,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('my-groups')
  async getMyGroups(
    @Headers('authorization') authHeader: string,
  ): Promise<GroupItem[]> {
    const userId = this.getUserId(authHeader);
    return this.groupService.getMyGroups(userId);
  }

  @Get(':id')
  async getGroupDetail(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
  ): Promise<{ group: ChatGroup; members: GroupMember[] }> {
    try {
      const userId = this.getUserId(authHeader);
      return this.groupService.getGroupDetail(id, userId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('invite')
  async inviteMembers(
    @Headers('authorization') authHeader: string,
    @Body() body: InviteMemberRequest,
  ): Promise<void> {
    try {
      const userId = this.getUserId(authHeader);
      await this.groupService.inviteMembers(body.groupId, userId, body.userIds);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete('member/:groupId/:userId')
  async removeMember(
    @Headers('authorization') authHeader: string,
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
  ): Promise<void> {
    try {
      const ownerId = this.getUserId(authHeader);
      await this.groupService.removeMember(groupId, ownerId, targetUserId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('leave/:id')
  async leaveGroup(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
  ): Promise<void> {
    try {
      const userId = this.getUserId(authHeader);
      await this.groupService.leaveGroup(id, userId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  async dismissGroup(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
  ): Promise<void> {
    try {
      const ownerId = this.getUserId(authHeader);
      await this.groupService.dismissGroup(id, ownerId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('message')
  async sendGroupMessage(
    @Headers('authorization') authHeader: string,
    @Body() body: SendGroupMessageRequest,
  ): Promise<GroupMessageItem> {
    try {
      const userId = this.getUserId(authHeader);
      return await this.groupService.sendGroupMessage(
        body.groupId,
        userId,
        body.msgType,
        body.encryptedContent,
        body.iv,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('messages/:id')
  async getGroupMessages(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<GroupMessageListResponse> {
    const userId = this.getUserId(authHeader);
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.groupService.getGroupMessages(id, userId, limitNum, cursor);
  }

  @Post('recall')
  async recallMessage(
    @Headers('authorization') authHeader: string,
    @Body() body: GroupRecallMessageRequest,
  ): Promise<void> {
    try {
      const userId = this.getUserId(authHeader);
      await this.groupService.recallGroupMessage(
        body.groupId,
        body.messageId,
        userId,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        (error as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
