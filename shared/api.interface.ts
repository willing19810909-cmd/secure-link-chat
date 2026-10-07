/* 前后端共享的类型定义 */

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';
export type MessageType = 'text' | 'image' | 'video' | 'voice';
export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';
export type GroupRole = 'owner' | 'admin' | 'member';

export interface ChatUser {
  id: string;
  idCode: string;
  username: string;
  publicKey: string;
  onlineStatus: boolean;
  lastSeenAt: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  publicKey: string;
  encryptedPrivateKey: string;
}

export interface RegisterResponse {
  user: ChatUser;
  token: string;
}

export interface LoginRequest {
  idCode: string;
  password: string;
}

export interface LoginResponse {
  user: ChatUser;
  token: string;
  encryptedPrivateKey: string;
}

export interface FriendRequestItem {
  id: string;
  sender: ChatUser;
  receiver: ChatUser;
  status: FriendRequestStatus;
  createdAt: string;
}

export interface FriendItem {
  id: string;
  friendId: string;
  friend: ChatUser;
  remarkName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

export interface AddFriendRequest {
  idCode: string;
}

export interface MessageItem {
  id: string;
  senderId: string;
  receiverId: string;
  msgType: MessageType;
  encryptedContent: string;
  iv?: string;
  status: MessageStatus;
  createdAt: string;
  isRecalled?: boolean;
  recalledAt?: string;
}

export interface GroupMessageItem {
  id: string;
  groupId: string;
  senderId: string;
  senderUsername: string;
  msgType: MessageType;
  encryptedContent: string;
  iv?: string;
  status: MessageStatus;
  createdAt: string;
  isRecalled?: boolean;
  recalledAt?: string;
}

export interface SendMessageRequest {
  receiverId: string;
  msgType: MessageType;
  encryptedContent: string;
  iv: string;
}

export interface SendGroupMessageRequest {
  groupId: string;
  msgType: MessageType;
  encryptedContent: string;
  iv: string;
}

export interface UpdateRemarkRequest {
  friendId: string;
  remarkName: string;
}

export interface MessageListResponse {
  items: MessageItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface GroupMessageListResponse {
  items: GroupMessageItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface ChatGroup {
  id: string;
  name: string;
  avatarUrl?: string;
  groupCode: string;
  ownerId: string;
  memberCount: number;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  user: ChatUser;
  role: GroupRole;
  nickname?: string;
  joinedAt: string;
}

export interface GroupItem {
  group: ChatGroup;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

export interface CreateGroupRequest {
  name: string;
  memberIds: string[];
}

export interface InviteMemberRequest {
  groupId: string;
  userIds: string[];
}

export interface RecallMessageRequest {
  messageId: string;
}

export interface GroupRecallMessageRequest {
  groupId: string;
  messageId: string;
}

export interface WSMessage {
  type:
    | 'message'
    | 'status_update'
    | 'read_receipt'
    | 'typing'
    | 'friend_request'
    | 'recall'
    | 'group_message'
    | 'group_recall';
  payload: unknown;
}

export interface WSMessagePayload {
  message: MessageItem;
}

export interface WSGroupMessagePayload {
  message: GroupMessageItem;
}

export interface WSStatusPayload {
  messageId: string;
  status: MessageStatus;
}

export interface WSFriendRequestPayload {
  request: FriendRequestItem;
}

export interface WSRecallPayload {
  messageId: string;
  userId?: string;
}

export interface WSGroupRecallPayload {
  groupId: string;
  messageId: string;
  userId: string;
}
