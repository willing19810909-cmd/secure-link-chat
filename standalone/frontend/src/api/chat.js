const TOKEN_KEY = 'enc_chat_token';
const UNAUTHORIZED_EVENT = 'enc_chat_unauthorized';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function onUnauthorized(callback) {
  const handler = () => callback();
  window.addEventListener(UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

async function apiFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body) {
    if (options.body instanceof FormData) {
      config.body = options.body;
    } else if (typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    } else {
      config.body = options.body;
    }
  }

  const response = await fetch(url, config);

  if (response.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const err = new Error(typeof data === 'object' && data.message ? data.message : `HTTP ${response.status}`);
    err.status = response.status;
    err.response = { data, status: response.status };
    throw err;
  }

  return data;
}

const logger = {
  error: (msg, err) => console.error(msg, err),
  info: (msg, ...args) => console.log(msg, ...args),
};

export async function register(username, password, publicKey, encryptedPrivateKey) {
  try {
    return await apiFetch('/api/auth/register', {
      method: 'POST',
      body: { username, password, publicKey, encryptedPrivateKey },
    });
  } catch (error) {
    logger.error('注册失败', error);
    throw error;
  }
}

export async function login(idCode, password) {
  try {
    return await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { idCode, password },
    });
  } catch (error) {
    logger.error('登录失败', error);
    throw error;
  }
}

export async function getMe() {
  try {
    return await apiFetch('/api/auth/me', { method: 'GET' });
  } catch (error) {
    logger.error('获取用户信息失败', error);
    throw error;
  }
}

export async function getFriends() {
  try {
    return await apiFetch('/api/friends', { method: 'GET' });
  } catch (error) {
    logger.error('获取好友列表失败', error);
    throw error;
  }
}

export async function addFriend(idCode) {
  try {
    return await apiFetch('/api/friends/request', {
      method: 'POST',
      body: { idCode },
    });
  } catch (error) {
    logger.error('添加好友失败', error);
    throw error;
  }
}

export async function getFriendRequests() {
  try {
    return await apiFetch('/api/friends/requests', { method: 'GET' });
  } catch (error) {
    logger.error('获取好友请求失败', error);
    throw error;
  }
}

export async function acceptFriendRequest(requestId) {
  try {
    return await apiFetch(`/api/friends/requests/${requestId}/accept`, {
      method: 'POST',
    });
  } catch (error) {
    logger.error('接受好友请求失败', error);
    throw error;
  }
}

export async function rejectFriendRequest(requestId) {
  try {
    return await apiFetch(`/api/friends/requests/${requestId}/reject`, {
      method: 'POST',
    });
  } catch (error) {
    logger.error('拒绝好友请求失败', error);
    throw error;
  }
}

export async function deleteFriend(friendId) {
  try {
    return await apiFetch(`/api/friends/${friendId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    logger.error('删除好友失败', error);
    throw error;
  }
}

export async function updateRemark(friendId, remarkName) {
  try {
    return await apiFetch('/api/friends/remark', {
      method: 'PATCH',
      body: { friendId, remarkName },
    });
  } catch (error) {
    logger.error('修改备注失败', error);
    throw error;
  }
}

export async function sendMessage(receiverId, msgType, encryptedContent, iv) {
  try {
    return await apiFetch('/api/messages', {
      method: 'POST',
      body: { receiverId, msgType, encryptedContent, iv },
    });
  } catch (error) {
    logger.error('发送消息失败', error);
    throw error;
  }
}

export async function getMessages(friendId, limit, cursor) {
  try {
    const params = new URLSearchParams({ friendId });
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    return await apiFetch(`/api/messages?${params.toString()}`, { method: 'GET' });
  } catch (error) {
    logger.error('获取消息失败', error);
    throw error;
  }
}

export async function markAsRead(friendId) {
  try {
    return await apiFetch('/api/messages/read', {
      method: 'POST',
      body: { friendId },
    });
  } catch (error) {
    logger.error('标记已读失败', error);
    throw error;
  }
}

export async function recallMessage(messageId) {
  try {
    return await apiFetch('/api/messages/recall', {
      method: 'POST',
      body: { messageId },
    });
  } catch (error) {
    logger.error('撤回消息失败', error);
    throw error;
  }
}

export async function uploadFile(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    return await apiFetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    logger.error('上传文件失败', error);
    throw error;
  }
}

export async function createGroup(name, memberIds) {
  try {
    return await apiFetch('/api/group/create', {
      method: 'POST',
      body: { name, memberIds },
    });
  } catch (error) {
    logger.error('创建群组失败', error);
    throw error;
  }
}

export async function getMyGroups() {
  try {
    return await apiFetch('/api/group/my-groups', { method: 'GET' });
  } catch (error) {
    logger.error('获取群组列表失败', error);
    throw error;
  }
}

export async function getGroupDetail(groupId) {
  try {
    return await apiFetch(`/api/group/${groupId}`, { method: 'GET' });
  } catch (error) {
    logger.error('获取群组详情失败', error);
    throw error;
  }
}

export async function inviteGroupMembers(groupId, userIds) {
  try {
    return await apiFetch('/api/group/invite', {
      method: 'POST',
      body: { groupId, userIds },
    });
  } catch (error) {
    logger.error('邀请成员失败', error);
    throw error;
  }
}

export async function removeGroupMember(groupId, userId) {
  try {
    return await apiFetch(`/api/group/member/${groupId}/${userId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    logger.error('移除成员失败', error);
    throw error;
  }
}

export async function leaveGroup(groupId) {
  try {
    return await apiFetch(`/api/group/leave/${groupId}`, {
      method: 'POST',
    });
  } catch (error) {
    logger.error('退出群组失败', error);
    throw error;
  }
}

export async function dismissGroup(groupId) {
  try {
    return await apiFetch(`/api/group/${groupId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    logger.error('解散群组失败', error);
    throw error;
  }
}

export async function sendGroupMessage(groupId, msgType, encryptedContent, iv) {
  try {
    return await apiFetch('/api/group/message', {
      method: 'POST',
      body: { groupId, msgType, encryptedContent, iv },
    });
  } catch (error) {
    logger.error('发送群消息失败', error);
    throw error;
  }
}

export async function getGroupMessages(groupId, limit, cursor) {
  try {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    return await apiFetch(`/api/group/messages/${groupId}?${params.toString()}`, { method: 'GET' });
  } catch (error) {
    logger.error('获取群消息失败', error);
    throw error;
  }
}

export async function recallGroupMessage(groupId, messageId) {
  try {
    return await apiFetch('/api/group/recall', {
      method: 'POST',
      body: { groupId, messageId },
    });
  } catch (error) {
    logger.error('撤回群消息失败', error);
    throw error;
  }
}

export function getWsUrl() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = getAuthToken();
  return `${protocol}://${location.host}/api/chat-ws?token=${encodeURIComponent(token || '')}`;
}
