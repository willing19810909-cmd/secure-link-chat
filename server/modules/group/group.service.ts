import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, lt, inArray, sql } from 'drizzle-orm';
import {
  chatGroups,
  groupMembers,
  groupMessages,
  chatUsers,
} from '../../database/schema';
import { generateIdCode } from '../../common/utils/id-code';
import type {
  ChatGroup,
  GroupItem,
  GroupMember,
  GroupMessageItem,
  GroupRole,
  MessageType,
  ChatUser,
} from '@shared/api.interface';

@Injectable()
export class GroupService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async createGroup(
    ownerId: string,
    name: string,
    memberIds: string[],
  ): Promise<ChatGroup> {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('群组名称不能为空');
    }

    const allMemberIds = Array.from(new Set([ownerId, ...memberIds]));

    const existingUsers = await this.db
      .select({ id: chatUsers.id })
      .from(chatUsers)
      .where(inArray(chatUsers.id, allMemberIds));

    if (existingUsers.length !== allMemberIds.length) {
      throw new BadRequestException('部分用户不存在');
    }

    let groupCode: string;
    let attempts = 0;
    while (attempts < 10) {
      groupCode = generateIdCode(8);
      const existing = await this.db
        .select()
        .from(chatGroups)
        .where(eq(chatGroups.groupCode, groupCode))
        .limit(1);
      if (existing.length === 0) break;
      attempts++;
    }

    const result = await this.db.transaction(async (tx) => {
      const [group] = await tx
        .insert(chatGroups)
        .values({
          name: name.trim(),
          groupCode: groupCode!,
          ownerId,
          memberCount: allMemberIds.length,
        })
        .returning();

      const memberValues = allMemberIds.map((uid: string) => ({
        groupId: group.id,
        userId: uid,
        role: uid === ownerId ? 'owner' : 'member',
      }));

      await tx.insert(groupMembers).values(memberValues);

      return group;
    });

    return this.toChatGroup(result);
  }

  async getMyGroupIds(userId: string): Promise<string[]> {
    const memberships = await this.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));
    return memberships.map((m: { groupId: string }) => m.groupId);
  }

  async getMyGroups(userId: string): Promise<GroupItem[]> {
    const myMemberships = await this.db
      .select({
        groupId: groupMembers.groupId,
      })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));

    if (myMemberships.length === 0) {
      return [];
    }

    const groupIds = myMemberships.map((m: { groupId: string }) => m.groupId);
    const groups = await this.db
      .select()
      .from(chatGroups)
      .where(inArray(chatGroups.id, groupIds));

    const items: GroupItem[] = [];
    for (const group of groups) {
      const [lastMsg] = await this.db
        .select({
          encryptedContent: groupMessages.encryptedContent,
          createdAt: groupMessages.createdAt,
          isRecalled: groupMessages.isRecalled,
        })
        .from(groupMessages)
        .where(eq(groupMessages.groupId, group.id))
        .orderBy(desc(groupMessages.createdAt))
        .limit(1);

      const unreadResult = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(groupMessages)
        .where(
          and(
            eq(groupMessages.groupId, group.id),
            sql`${groupMessages.senderId} != ${userId}`,
            eq(groupMessages.status, 'sent'),
          ),
        );

      items.push({
        group: this.toChatGroup(group),
        lastMessage: lastMsg && !lastMsg.isRecalled
          ? lastMsg.encryptedContent
          : undefined,
        lastMessageTime: lastMsg ? lastMsg.createdAt.toISOString() : undefined,
        unreadCount: Number(unreadResult[0]?.count ?? 0),
      });
    }

    return items;
  }

  async getGroupDetail(
    groupId: string,
    userId: string,
  ): Promise<{ group: ChatGroup; members: GroupMember[] }> {
    const [membership] = await this.db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new ForbiddenException('您不是该群成员');
    }

    const [group] = await this.db
      .select()
      .from(chatGroups)
      .where(eq(chatGroups.id, groupId))
      .limit(1);

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    const members = await this.db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(desc(groupMembers.role));

    const userIds = members.map((m: typeof groupMembers.$inferSelect) => m.userId);
    const users = await this.db
      .select()
      .from(chatUsers)
      .where(inArray(chatUsers.id, userIds));

    const userMap = new Map<string, typeof chatUsers.$inferSelect>();
    for (const user of users) {
      userMap.set(user.id, user);
    }

    const memberItems: GroupMember[] = members.map(
      (m: typeof groupMembers.$inferSelect): GroupMember => {
        const user = userMap.get(m.userId);
        return {
          id: m.id,
          groupId: m.groupId,
          userId: m.userId,
          user: user ? this.toChatUser(user) : ({} as ChatUser),
          role: m.role as GroupRole,
          nickname: m.nickname ?? undefined,
          joinedAt: m.joinedAt.toISOString(),
        };
      },
    );

    return {
      group: this.toChatGroup(group),
      members: memberItems,
    };
  }

  async inviteMembers(
    groupId: string,
    inviterId: string,
    userIds: string[],
  ): Promise<void> {
    const [membership] = await this.db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, inviterId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new ForbiddenException('您不是该群成员，无法邀请');
    }

    if (userIds.length === 0) {
      throw new BadRequestException('邀请用户列表不能为空');
    }

    const existingMembers = await this.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          inArray(groupMembers.userId, userIds),
        ),
      );

    const existingMemberIds = new Set(
      existingMembers.map((m: { userId: string }) => m.userId),
    );
    const newUserIds = userIds.filter((uid: string) => !existingMemberIds.has(uid));

    if (newUserIds.length === 0) {
      return;
    }

    const validUsers = await this.db
      .select({ id: chatUsers.id })
      .from(chatUsers)
      .where(inArray(chatUsers.id, newUserIds));

    if (validUsers.length !== newUserIds.length) {
      throw new BadRequestException('部分用户不存在');
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(groupMembers).values(
        newUserIds.map((uid: string) => ({
          groupId,
          userId: uid,
          role: 'member',
        })),
      );

      await tx
        .update(chatGroups)
        .set({
          memberCount: sql<number>`${chatGroups.memberCount} + ${newUserIds.length}`,
        })
        .where(eq(chatGroups.id, groupId));
    });
  }

  async removeMember(
    groupId: string,
    ownerId: string,
    userId: string,
  ): Promise<void> {
    const [group] = await this.db
      .select({ ownerId: chatGroups.ownerId })
      .from(chatGroups)
      .where(eq(chatGroups.id, groupId))
      .limit(1);

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    if (group.ownerId !== ownerId) {
      throw new ForbiddenException('只有群主可以移除成员');
    }

    if (userId === ownerId) {
      throw new BadRequestException('不能移除群主');
    }

    const deleted = await this.db
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
        ),
      )
      .returning({ id: groupMembers.id });

    if (deleted.length === 0) {
      throw new NotFoundException('该用户不是群成员');
    }

    await this.db
      .update(chatGroups)
      .set({
        memberCount: sql<number>`${chatGroups.memberCount} - 1`,
      })
      .where(eq(chatGroups.id, groupId));
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    const [group] = await this.db
      .select({ ownerId: chatGroups.ownerId })
      .from(chatGroups)
      .where(eq(chatGroups.id, groupId))
      .limit(1);

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    if (group.ownerId === userId) {
      throw new BadRequestException('群主不能退出群组，请先解散群组或转让群主');
    }

    const deleted = await this.db
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
        ),
      )
      .returning({ id: groupMembers.id });

    if (deleted.length === 0) {
      throw new NotFoundException('您不是该群成员');
    }

    await this.db
      .update(chatGroups)
      .set({
        memberCount: sql<number>`${chatGroups.memberCount} - 1`,
      })
      .where(eq(chatGroups.id, groupId));
  }

  async dismissGroup(groupId: string, ownerId: string): Promise<void> {
    const [group] = await this.db
      .select()
      .from(chatGroups)
      .where(eq(chatGroups.id, groupId))
      .limit(1);

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    if (group.ownerId !== ownerId) {
      throw new ForbiddenException('只有群主可以解散群组');
    }

    await this.db.delete(chatGroups).where(eq(chatGroups.id, groupId));
  }

  async sendGroupMessage(
    groupId: string,
    senderId: string,
    msgType: MessageType,
    encryptedContent: string,
    iv: string,
  ): Promise<GroupMessageItem> {
    const [membership] = await this.db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, senderId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new ForbiddenException('您不是该群成员');
    }

    const [sender] = await this.db
      .select({ username: chatUsers.username })
      .from(chatUsers)
      .where(eq(chatUsers.id, senderId))
      .limit(1);

    const [msg] = await this.db
      .insert(groupMessages)
      .values({
        groupId,
        senderId,
        msgType,
        encryptedContent,
        iv,
        status: 'sent',
      })
      .returning();

    return this.toGroupMessageItem(msg, sender?.username ?? '');
  }

  async getGroupMessages(
    groupId: string,
    userId: string,
    limit: number = 50,
    cursor?: string,
  ): Promise<{ items: GroupMessageItem[]; hasMore: boolean; nextCursor?: string }> {
    const [membership] = await this.db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new ForbiddenException('您不是该群成员');
    }

    const limitPlusOne = limit + 1;
    let results: (typeof groupMessages.$inferSelect)[];

    if (cursor) {
      const [cursorMsg] = await this.db
        .select({ createdAt: groupMessages.createdAt })
        .from(groupMessages)
        .where(eq(groupMessages.id, cursor))
        .limit(1);

      if (cursorMsg) {
        results = await this.db
          .select()
          .from(groupMessages)
          .where(
            and(
              eq(groupMessages.groupId, groupId),
              lt(groupMessages.createdAt, cursorMsg.createdAt),
            ),
          )
          .orderBy(desc(groupMessages.createdAt))
          .limit(limitPlusOne);
      } else {
        results = await this.db
          .select()
          .from(groupMessages)
          .where(eq(groupMessages.groupId, groupId))
          .orderBy(desc(groupMessages.createdAt))
          .limit(limitPlusOne);
      }
    } else {
      results = await this.db
        .select()
        .from(groupMessages)
        .where(eq(groupMessages.groupId, groupId))
        .orderBy(desc(groupMessages.createdAt))
        .limit(limitPlusOne);
    }

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    const senderIds = Array.from(
      new Set(items.map((m: typeof groupMessages.$inferSelect) => m.senderId)),
    );
    const senders = await this.db
      .select({ id: chatUsers.id, username: chatUsers.username })
      .from(chatUsers)
      .where(inArray(chatUsers.id, senderIds));

    const senderMap = new Map<string, string>();
    for (const s of senders) {
      senderMap.set(s.id, s.username);
    }

    return {
      items: items
        .map((m: typeof groupMessages.$inferSelect) =>
          this.toGroupMessageItem(m, senderMap.get(m.senderId) ?? ''),
        )
        .reverse(),
      hasMore,
      nextCursor,
    };
  }

  async recallGroupMessage(
    groupId: string,
    messageId: string,
    userId: string,
  ): Promise<void> {
    const [msg] = await this.db
      .select()
      .from(groupMessages)
      .where(
        and(
          eq(groupMessages.id, messageId),
          eq(groupMessages.groupId, groupId),
        ),
      )
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
      .update(groupMessages)
      .set({
        isRecalled: true,
        recalledAt: new Date(),
      })
      .where(eq(groupMessages.id, messageId));
  }

  private toChatGroup(row: typeof chatGroups.$inferSelect): ChatGroup {
    return {
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl ?? undefined,
      groupCode: row.groupCode,
      ownerId: row.ownerId,
      memberCount: row.memberCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toGroupMessageItem(
    row: typeof groupMessages.$inferSelect,
    senderUsername: string,
  ): GroupMessageItem {
    return {
      id: row.id,
      groupId: row.groupId,
      senderId: row.senderId,
      senderUsername,
      msgType: row.msgType as MessageType,
      encryptedContent: row.encryptedContent,
      iv: row.iv ?? undefined,
      status: row.status as import('@shared/api.interface').MessageStatus,
      createdAt: row.createdAt.toISOString(),
      isRecalled: row.isRecalled,
      recalledAt: row.recalledAt ? row.recalledAt.toISOString() : undefined,
    };
  }

  private toChatUser(row: typeof chatUsers.$inferSelect): ChatUser {
    return {
      id: row.id,
      idCode: row.idCode,
      username: row.username,
      publicKey: row.publicKey,
      onlineStatus: row.onlineStatus ?? false,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
