import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, or, asc } from 'drizzle-orm';
import { friendships, friendRequests, chatUsers } from '../../database/schema';
import type {
  FriendItem,
  FriendRequestItem,
  FriendRequestStatus,
  ChatUser,
} from '@shared/api.interface';

@Injectable()
export class FriendService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async sendRequest(senderId: string, receiverIdCode: string): Promise<FriendRequestItem> {
    const [receiver] = await this.db
      .select()
      .from(chatUsers)
      .where(eq(chatUsers.idCode, receiverIdCode.toUpperCase()))
      .limit(1);

    if (!receiver) {
      throw new Error('用户不存在');
    }

    if (receiver.id === senderId) {
      throw new Error('不能添加自己为好友');
    }

    const existing = await this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.userId, senderId),
          eq(friendships.friendId, receiver.id),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Error('已经是好友了');
    }

    const [existingReq] = await this.db
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.senderId, senderId),
          eq(friendRequests.receiverId, receiver.id),
        ),
      )
      .limit(1);

    if (existingReq && existingReq.status === 'pending') {
      throw new Error('好友请求已发送，等待对方确认');
    }

    const [req] = await this.db
      .insert(friendRequests)
      .values({
        senderId,
        receiverId: receiver.id,
        status: 'pending',
      })
      .returning();

    const [sender, recv] = await Promise.all([
      this.getUserInfo(senderId),
      this.getUserInfo(receiver.id),
    ]);

    return {
      id: req.id,
      sender: sender!,
      receiver: recv!,
      status: req.status as FriendRequestStatus,
      createdAt: req.createdAt.toISOString(),
    };
  }

  async acceptRequest(requestId: string, userId: string): Promise<void> {
    const [req] = await this.db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, requestId))
      .limit(1);

    if (!req || req.receiverId !== userId) {
      throw new Error('请求不存在');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(friendRequests)
        .set({ status: 'accepted' })
        .where(eq(friendRequests.id, requestId));

      await tx.insert(friendships).values([
        { userId: req.senderId, friendId: req.receiverId },
        { userId: req.receiverId, friendId: req.senderId },
      ]);
    });
  }

  async rejectRequest(requestId: string, userId: string): Promise<void> {
    const [req] = await this.db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, requestId))
      .limit(1);

    if (!req || req.receiverId !== userId) {
      throw new Error('请求不存在');
    }

    await this.db
      .update(friendRequests)
      .set({ status: 'rejected' })
      .where(eq(friendRequests.id, requestId));
  }

  async getFriendList(userId: string): Promise<FriendItem[]> {
    const friends = await this.db
      .select({
        id: friendships.id,
        friendId: friendships.friendId,
        remarkName: friendships.remarkName,
      })
      .from(friendships)
      .where(eq(friendships.userId, userId))
      .orderBy(asc(friendships.remarkName));

    const items: FriendItem[] = [];
    for (const f of friends) {
      const friendInfo = await this.getUserInfo(f.friendId);
      if (friendInfo) {
        items.push({
          id: f.id,
          friendId: f.friendId,
          friend: friendInfo,
          remarkName: f.remarkName ?? undefined,
          unreadCount: 0,
        });
      }
    }
    return items;
  }

  async getPendingRequests(userId: string): Promise<FriendRequestItem[]> {
    const reqs = await this.db
      .select()
      .from(friendRequests)
      .where(
        and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, 'pending')),
      )
      .orderBy(asc(friendRequests.createdAt));

    const items: FriendRequestItem[] = [];
    for (const req of reqs) {
      const [sender, receiver] = await Promise.all([
        this.getUserInfo(req.senderId),
        this.getUserInfo(req.receiverId),
      ]);
      if (sender && receiver) {
        items.push({
          id: req.id,
          sender,
          receiver,
          status: req.status as FriendRequestStatus,
          createdAt: req.createdAt.toISOString(),
        });
      }
    }
    return items;
  }

  async deleteFriend(userId: string, friendId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(friendships)
        .where(
          and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
        );
      await tx
        .delete(friendships)
        .where(
          and(eq(friendships.userId, friendId), eq(friendships.friendId, userId)),
        );
    });
  }

  async updateRemark(userId: string, friendId: string, remarkName: string): Promise<void> {
    await this.db
      .update(friendships)
      .set({ remarkName })
      .where(
        and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
      );
  }

  async getFriendship(userId: string, friendId: string): Promise<string | null> {
    const [fs] = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
      )
      .limit(1);
    return fs?.id ?? null;
  }

  private async getUserInfo(userId: string): Promise<ChatUser | null> {
    const [user] = await this.db
      .select()
      .from(chatUsers)
      .where(eq(chatUsers.id, userId))
      .limit(1);
    if (!user) return null;
    return {
      id: user.id,
      idCode: user.idCode,
      username: user.username,
      publicKey: user.publicKey,
      onlineStatus: user.onlineStatus ?? false,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
