/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const groupMessages = pgTable("group_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull(),
  senderId: uuid("sender_id").notNull(),
  msgType: varchar("msg_type", { length: 20 }).notNull().default('text'),
  encryptedContent: text("encrypted_content").notNull(),
  iv: varchar("iv", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull().default('sent'),
  isRecalled: boolean("is_recalled").notNull().default(false),
  recalledAt: customTimestamptz("recalled_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_group_messages_group").on(table.groupId),
  index("idx_group_messages_sender").on(table.senderId),
  index("idx_group_messages_created").on(table.createdAt),
  foreignKey({
    columns: [table.groupId],
    foreignColumns: [chatGroups.id],
    name: "group_messages_group_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.senderId],
    foreignColumns: [chatUsers.id],
    name: "group_messages_sender_id_fkey",
  }).onDelete("cascade"),
]);

export const groupMembers = pgTable("group_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: varchar("role", { length: 20 }).notNull().default('member'),
  nickname: varchar("nickname", { length: 100 }),
  joinedAt: customTimestamptz("joined_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("group_members_group_id_user_id_key").on(table.groupId, table.userId),
  index("idx_group_members_group").on(table.groupId),
  index("idx_group_members_user").on(table.userId),
  foreignKey({
    columns: [table.groupId],
    foreignColumns: [chatGroups.id],
    name: "group_members_group_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [chatUsers.id],
    name: "group_members_user_id_fkey",
  }).onDelete("cascade"),
]);

export const chatGroups = pgTable("chat_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  avatarUrl: text("avatar_url"),
  groupCode: varchar("group_code", { length: 12 }).notNull().unique(),
  ownerId: uuid("owner_id").notNull(),
  memberCount: integer("member_count").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("chat_groups_group_code_key").on(table.groupCode),
  index("idx_chat_groups_owner").on(table.ownerId),
  index("idx_chat_groups_group_code").on(table.groupCode),
  foreignKey({
    columns: [table.ownerId],
    foreignColumns: [chatUsers.id],
    name: "chat_groups_owner_id_fkey",
  }).onDelete("cascade"),
]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  friendshipId: uuid("friendship_id").notNull(),
  senderId: uuid("sender_id").notNull(),
  receiverId: uuid("receiver_id").notNull(),
  msgType: varchar("msg_type", { length: 20 }).notNull().default('text'),
  encryptedContent: text("encrypted_content").notNull(),
  iv: varchar("iv", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull().default('sent'),
  isRecalled: boolean("is_recalled").notNull().default(false),
  recalledAt: customTimestamptz("recalled_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_messages_friendship").on(table.friendshipId),
  index("idx_messages_sender").on(table.senderId),
  index("idx_messages_receiver").on(table.receiverId),
  index("idx_messages_status").on(table.status),
  index("idx_messages_created").on(table.createdAt),
  foreignKey({
    columns: [table.friendshipId],
    foreignColumns: [friendships.id],
    name: "messages_friendship_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.senderId],
    foreignColumns: [chatUsers.id],
    name: "messages_sender_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.receiverId],
    foreignColumns: [chatUsers.id],
    name: "messages_receiver_id_fkey",
  }).onDelete("cascade"),
]);

export const friendships = pgTable("friendships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  friendId: uuid("friend_id").notNull(),
  remarkName: varchar("remark_name", { length: 100 }),
  sharedSecret: text("shared_secret"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("friendships_user_id_friend_id_key").on(table.userId, table.friendId),
  index("idx_friendships_user").on(table.userId),
  index("idx_friendships_friend").on(table.friendId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [chatUsers.id],
    name: "friendships_user_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.friendId],
    foreignColumns: [chatUsers.id],
    name: "friendships_friend_id_fkey",
  }).onDelete("cascade"),
]);

export const friendRequests = pgTable("friend_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderId: uuid("sender_id").notNull(),
  receiverId: uuid("receiver_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("friend_requests_sender_id_receiver_id_key").on(table.senderId, table.receiverId),
  index("idx_friend_requests_sender").on(table.senderId),
  index("idx_friend_requests_receiver").on(table.receiverId),
  index("idx_friend_requests_status").on(table.status),
  foreignKey({
    columns: [table.senderId],
    foreignColumns: [chatUsers.id],
    name: "friend_requests_sender_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.receiverId],
    foreignColumns: [chatUsers.id],
    name: "friend_requests_receiver_id_fkey",
  }).onDelete("cascade"),
]);

export const chatUsers = pgTable("chat_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  idCode: varchar("id_code", { length: 12 }).notNull().unique(),
  username: varchar("username", { length: 100 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  publicKey: text("public_key").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  onlineStatus: boolean("online_status").default(false),
  lastSeenAt: customTimestamptz("last_seen_at", { precision: 3 }).default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("chat_users_id_code_key").on(table.idCode),
  index("idx_chat_users_id_code").on(table.idCode),
  index("idx_chat_users_online_status").on(table.onlineStatus),
]);

// table aliases
export const chatGroupsTable = chatGroups;
export const chatUsersTable = chatUsers;
export const friendRequestsTable = friendRequests;
export const friendshipsTable = friendships;
export const groupMembersTable = groupMembers;
export const groupMessagesTable = groupMessages;
export const messagesTable = messages;
