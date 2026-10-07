import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

const TOKEN_KEY = 'enc_chat_token';
const UNAUTHORIZED_EVENT = 'enc_chat_unauthorized';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function onUnauthorized(callback: () => void): () => void {
  const handler = (): void => callback();
  window.addEventListener(UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

let interceptorsInstalled = false;

function installInterceptors(): void {
  if (interceptorsInstalled) return;
  interceptorsInstalled = true;

  axiosForBackend.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token && config.headers) {
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
    return config;
  });

  axiosForBackend.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        clearAuthToken();
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
      return Promise.reject(error);
    },
  );
}

installInterceptors();

export async function register(
  username: string,
  password: string,
  publicKey: string,
  encryptedPrivateKey: string,
) {
  try {
    const response = await axiosForBackend({
      url: '/api/auth/register',
      method: 'POST',
      data: { username, password, publicKey, encryptedPrivateKey },
    });
    return response.data;
  } catch (error) {
    logger.error('注册失败', error);
    throw error;
  }
}

export async function login(idCode: string, password: string) {
  try {
    const response = await axiosForBackend({
      url: '/api/auth/login',
      method: 'POST',
      data: { idCode, password },
    });
    return response.data;
  } catch (error) {
    logger.error('登录失败', error);
    throw error;
  }
}

export async function getMe() {
  try {
    const response = await axiosForBackend({
      url: '/api/auth/me',
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取用户信息失败', error);
    throw error;
  }
}

export async function getFriends() {
  try {
    const response = await axiosForBackend({
      url: '/api/friends',
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取好友列表失败', error);
    throw error;
  }
}

export async function addFriend(idCode: string) {
  try {
    const response = await axiosForBackend({
      url: '/api/friends/request',
      method: 'POST',
      data: { idCode },
    });
    return response.data;
  } catch (error) {
    logger.error('添加好友失败', error);
    throw error;
  }
}

export async function getFriendRequests() {
  try {
    const response = await axiosForBackend({
      url: '/api/friends/requests',
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取好友请求失败', error);
    throw error;
  }
}

export async function acceptFriendRequest(requestId: string) {
  try {
    const response = await axiosForBackend({
      url: `/api/friends/requests/${requestId}/accept`,
      method: 'POST',
    });
    return response.data;
  } catch (error) {
    logger.error('接受好友请求失败', error);
    throw error;
  }
}

export async function rejectFriendRequest(requestId: string) {
  try {
    const response = await axiosForBackend({
      url: `/api/friends/requests/${requestId}/reject`,
      method: 'POST',
    });
    return response.data;
  } catch (error) {
    logger.error('拒绝好友请求失败', error);
    throw error;
  }
}

export async function deleteFriend(friendId: string) {
  try {
    const response = await axiosForBackend({
      url: `/api/friends/${friendId}`,
      method: 'DELETE',
    });
    return response.data;
  } catch (error) {
    logger.error('删除好友失败', error);
    throw error;
  }
}

export async function updateRemark(friendId: string, remarkName: string) {
  try {
    const response = await axiosForBackend({
      url: '/api/friends/remark',
      method: 'PATCH',
      data: { friendId, remarkName },
    });
    return response.data;
  } catch (error) {
    logger.error('修改备注失败', error);
    throw error;
  }
}

export async function sendMessage(
  receiverId: string,
  msgType: string,
  encryptedContent: string,
  iv: string,
) {
  try {
    const response = await axiosForBackend({
      url: '/api/messages',
      method: 'POST',
      data: { receiverId, msgType, encryptedContent, iv },
    });
    return response.data;
  } catch (error) {
    logger.error('发送消息失败', error);
    throw error;
  }
}

export async function getMessages(friendId: string, limit?: number, cursor?: string) {
  try {
    const params = new URLSearchParams({ friendId });
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const response = await axiosForBackend({
      url: `/api/messages?${params.toString()}`,
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取消息失败', error);
    throw error;
  }
}

export async function markAsRead(friendId: string) {
  try {
    const response = await axiosForBackend({
      url: '/api/messages/read',
      method: 'POST',
      data: { friendId },
    });
    return response.data;
  } catch (error) {
    logger.error('标记已读失败', error);
    throw error;
  }
}

export async function recallMessage(messageId: string) {
  try {
    const response = await axiosForBackend({
      url: '/api/messages/recall',
      method: 'POST',
      data: { messageId },
    });
    return response.data;
  } catch (error) {
    logger.error('撤回消息失败', error);
    throw error;
  }
}

export async function createGroup(name: string, memberIds: string[]) {
  try {
    const response = await axiosForBackend({
      url: '/api/group/create',
      method: 'POST',
      data: { name, memberIds },
    });
    return response.data;
  } catch (error) {
    logger.error('创建群组失败', error);
    throw error;
  }
}

export async function getMyGroups() {
  try {
    const response = await axiosForBackend({
      url: '/api/group/my-groups',
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取群组列表失败', error);
    throw error;
  }
}

export async function getGroupDetail(groupId: string) {
  try {
    const response = await axiosForBackend({
      url: `/api/group/${groupId}`,
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取群组详情失败', error);
    throw error;
  }
}

export async function inviteGroupMembers(groupId: string, userIds: string[]) {
  try {
    const response = await axiosForBackend({
      url: '/api/group/invite',
      method: 'POST',
      data: { groupId, userIds },
    });
    return response.data;
  } catch (error) {
    logger.error('邀请成员失败', error);
    throw error;
  }
}

export async function removeGroupMember(groupId: string, userId: string) {
  try {
    const response = await axiosForBackend({
      url: `/api/group/member/${groupId}/${userId}`,
      method: 'DELETE',
    });
    return response.data;
  } catch (error) {
    logger.error('移除成员失败', error);
    throw error;
  }
}

export async function leaveGroup(groupId: string) {
  try {
    const response = await axiosForBackend({
      url: `/api/group/leave/${groupId}`,
      method: 'POST',
    });
    return response.data;
  } catch (error) {
    logger.error('退出群组失败', error);
    throw error;
  }
}

export async function dismissGroup(groupId: string) {
  try {
    const response = await axiosForBackend({
      url: `/api/group/${groupId}`,
      method: 'DELETE',
    });
    return response.data;
  } catch (error) {
    logger.error('解散群组失败', error);
    throw error;
  }
}

export async function sendGroupMessage(
  groupId: string,
  msgType: string,
  encryptedContent: string,
  iv: string,
) {
  try {
    const response = await axiosForBackend({
      url: '/api/group/message',
      method: 'POST',
      data: { groupId, msgType, encryptedContent, iv },
    });
    return response.data;
  } catch (error) {
    logger.error('发送群消息失败', error);
    throw error;
  }
}

export async function getGroupMessages(
  groupId: string,
  limit?: number,
  cursor?: string,
) {
  try {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    const response = await axiosForBackend({
      url: `/api/group/messages/${groupId}?${params.toString()}`,
      method: 'GET',
    });
    return response.data;
  } catch (error) {
    logger.error('获取群消息失败', error);
    throw error;
  }
}

export async function recallGroupMessage(groupId: string, messageId: string) {
  try {
    const response = await axiosForBackend({
      url: '/api/group/recall',
      method: 'POST',
      data: { groupId, messageId },
    });
    return response.data;
  } catch (error) {
    logger.error('撤回群消息失败', error);
    throw error;
  }
}
