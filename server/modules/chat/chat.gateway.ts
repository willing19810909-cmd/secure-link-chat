import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { MessageService } from '../message/message.service';
import { GroupService } from '../group/group.service';
import type {
  MessageItem,
  GroupMessageItem,
  SendMessageRequest,
  SendGroupMessageRequest,
  MessageStatus,
  RecallMessageRequest,
  GroupRecallMessageRequest,
} from '@shared/api.interface';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  path: '/api/chat-ws',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly authService: AuthService,
    private readonly messageService: MessageService,
    private readonly groupService: GroupService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth.token as string;
    if (!token) {
      client.disconnect();
      return;
    }

    const userId = this.authService.verifyToken(token);
    if (!userId) {
      client.disconnect();
      return;
    }

    client.data.userId = userId;
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);

    await this.authService.updateOnlineStatus(userId, true);
    this.broadcastStatus(userId, true);

    const groups = await this.groupService.getMyGroupIds(userId);
    for (const groupId of groups) {
      client.join(`group:${groupId}`);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = client.data.userId as string;
    if (!userId) return;

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        await this.authService.updateOnlineStatus(userId, false);
        this.broadcastStatus(userId, false);
      }
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageRequest,
  ): Promise<void> {
    const userId = client.data.userId as string;
    if (!userId) return;

    try {
      const message = await this.messageService.sendMessage(
        userId,
        data.receiverId,
        data.msgType,
        data.encryptedContent,
        data.iv,
      );

      client.emit('message_sent', { messageId: message.id, status: 'sent' });

      this.sendToUser(data.receiverId, 'new_message', { message });

      this.sendToUser(userId, 'message_delivered', {
        messageId: message.id,
        status: 'delivered',
      });
    } catch (error) {
      client.emit('error', { message: (error as Error).message });
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { friendId: string },
  ): Promise<void> {
    const userId = client.data.userId as string;
    if (!userId) return;

    await this.messageService.markAsRead(userId, data.friendId);

    this.sendToUser(data.friendId, 'messages_read', {
      readerId: userId,
    });
  }

  @SubscribeMessage('send_group_message')
  async handleGroupMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendGroupMessageRequest,
  ): Promise<void> {
    const userId = client.data.userId as string;
    if (!userId) return;

    try {
      const message = await this.groupService.sendGroupMessage(
        data.groupId,
        userId,
        data.msgType,
        data.encryptedContent,
        data.iv,
      );

      client.emit('message_sent', { messageId: message.id, status: 'sent' });
      client.to(`group:${data.groupId}`).emit('new_group_message', { message });
    } catch (error) {
      client.emit('error', { message: (error as Error).message });
    }
  }

  @SubscribeMessage('recall_message')
  async handleRecall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RecallMessageRequest,
  ): Promise<void> {
    const userId = client.data.userId as string;
    if (!userId) return;

    try {
      const result = await this.messageService.recallMessage(data.messageId, userId);
      const payload = { messageId: data.messageId, userId };
      this.sendToUser(userId, 'message_recalled', payload);
      this.sendToUser(result.receiverId, 'message_recalled', payload);
    } catch (error) {
      client.emit('error', { message: (error as Error).message });
    }
  }

  @SubscribeMessage('recall_group_message')
  async handleGroupRecall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: GroupRecallMessageRequest,
  ): Promise<void> {
    const userId = client.data.userId as string;
    if (!userId) return;

    try {
      await this.groupService.recallGroupMessage(
        data.groupId,
        data.messageId,
        userId,
      );
      const payload = { groupId: data.groupId, messageId: data.messageId, userId };
      this.server.to(`group:${data.groupId}`).emit('group_message_recalled', payload);
    } catch (error) {
      client.emit('error', { message: (error as Error).message });
    }
  }

  @SubscribeMessage('mark_group_read')
  handleMarkGroupRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ): void {
    const userId = client.data.userId as string;
    if (!userId) return;
    client.emit('group_messages_read', { groupId: data.groupId, readerId: userId });
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { friendId: string; isTyping: boolean },
  ): void {
    const userId = client.data.userId as string;
    if (!userId) return;

    this.sendToUser(data.friendId, 'user_typing', {
      userId,
      isTyping: data.isTyping,
    });
  }

  sendToUser(userId: string, event: string, payload: unknown): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit(event, payload);
    }
  }

  broadcastStatus(userId: string, online: boolean): void {
    for (const [uid] of this.userSockets) {
      if (uid !== userId) {
        this.sendToUser(uid, 'user_status', { userId, online });
      }
    }
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  joinGroup(userId: string, groupId: string): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    for (const socketId of sockets) {
      this.server.to(socketId).socketsJoin(`group:${groupId}`);
    }
  }

  leaveGroup(userId: string, groupId: string): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    for (const socketId of sockets) {
      this.server.to(socketId).socketsLeave(`group:${groupId}`);
    }
  }

  broadcastToGroup(groupId: string, event: string, payload: unknown): void {
    this.server.to(`group:${groupId}`).emit(event, payload);
  }
}
