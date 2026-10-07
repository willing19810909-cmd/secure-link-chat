import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, lt } from 'drizzle-orm';
import { messages, friendships } from '../../database/schema';
import type {
  MessageItem,
  MessageStatus,
  MessageType,
} from '@shared/api.interface';

@Injectable()
export class MessageService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async sendMessage(
    senderId: string,
    receiverId: string,
    msgType: MessageType,
    encryptedContent: string,
    iv: string,
  ): Promise<MessageItem> {
    const [fs] = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(eq(friendships.userId, senderId), eq(friendships.friendId, receiverId)),
      )
      .limit(1);

    if (!fs) {
      throw new Error('不是好友关系');
    }

    const [msg] = await this.db
      .insert(messages)
      .values({
        friendshipId: fs.id,
        senderId,
        receiverId,
        msgType,
        encryptedContent,
        iv,
        status: 'sent',
      })
      .returning();

    return this.toMessageItem(msg);
  }

  async getMessages(
    userId: string,
    friendId: string,
    limit: number = 50,
    cursor?: string,
  ): Promise<{ items: MessageItem[]; hasMore: boolean; nextCursor?: string }> {
    const [fs] = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
      )
      .limit(1);

    if (!fs) {
      return { items: [], hasMore: false };
    }

    const limitPlusOne = limit + 1;
    let results: typeof messages.$inferSelect[];

    if (cursor) {
      const [cursorMsg] = await this.db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, cursor))
        .limit(1);
      if (cursorMsg) {
        results = await this.db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.friendshipId, fs.id),
              lt(messages.createdAt, cursorMsg.createdAt),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(limitPlusOne);
      } else {
        results = await this.db
          .select()
          .from(messages)
          .where(eq(messages.friendshipId, fs.id))
          .orderBy(desc(messages.createdAt))
          .limit(limitPlusOne);
      }
    } else {
      results = await this.db
        .select()
        .from(messages)
        .where(eq(messages.friendshipId, fs.id))
        .orderBy(desc(messages.createdAt))
        .limit(limitPlusOne);
    }
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return {
      items: items.map((m) => this.toMessageItem(m)).reverse(),
      hasMore,
      nextCursor,
    };
  }

  async updateStatus(messageId: string, status: MessageStatus): Promise<void> {
    await this.db
      .update(messages)
      .set({ status })
      .where(eq(messages.id, messageId));
  }

  async recallMessage(
    messageId: string,
    userId: string,
  ): Promise<{ receiverId: string; senderId: string }> {
    const [msg] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!msg) {
      throw new NotFoundException('消息不存在');
    }

    if (msg.senderId !== userId) {
      throw new ForbiddenException('只能撤回自己发送的消息');
    }

    if (msg.isRecalled) {
      throw new BadRequestException('消息已被撤回');
    }

    const timeDiff = Date.now() - msg.createdAt.getTime();
    if (timeDiff >= 2 * 60 * 1000) {
      throw new BadRequestException('超过撤回时限（2分钟）');
    }

    await this.db
      .update(messages)
      .set({
        isRecalled: true,
        recalledAt: new Date(),
      })
      .where(eq(messages.id, messageId));

    return { receiverId: msg.receiverId, senderId: msg.senderId };
  }

  async markAsRead(userId: string, friendId: string): Promise<void> {
    const [fs] = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
      )
      .limit(1);

    if (!fs) return;

    await this.db
      .update(messages)
      .set({ status: 'read' })
      .where(
        and(
          eq(messages.friendshipId, fs.id),
          eq(messages.receiverId, userId),
          eq(messages.status, 'delivered'),
        ),
      );
  }

  private toMessageItem(row: typeof messages.$inferSelect): MessageItem {
    return {
      id: row.id,
      senderId: row.senderId,
      receiverId: row.receiverId,
      msgType: row.msgType as MessageType,
      encryptedContent: row.encryptedContent,
      iv: row.iv ?? undefined,
      status: row.status as MessageStatus,
      createdAt: row.createdAt.toISOString(),
      isRecalled: row.isRecalled,
      recalledAt: row.recalledAt ? row.recalledAt.toISOString() : undefined,
    };
  }
}
