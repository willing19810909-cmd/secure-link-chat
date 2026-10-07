import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAuthToken } from '../api/chat';
import type { MessageItem, GroupMessageItem } from '@shared/api.interface';

interface UseChatSocketOptions {
  onMessage?: (message: MessageItem) => void;
  onGroupMessage?: (message: GroupMessageItem) => void;
  onMessageDelivered?: (messageId: string) => void;
  onMessageRead?: (readerId: string) => void;
  onUserStatus?: (userId: string, online: boolean) => void;
  onUserTyping?: (userId: string, isTyping: boolean) => void;
  onRecall?: (messageId: string) => void;
  onGroupRecall?: (groupId: string, messageId: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useChatSocket(options: UseChatSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    if (connecting) return;

    const token = getAuthToken();
    if (!token) return;

    setConnecting(true);

    const socket = io({
      path: '/api/chat-ws',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setConnected(true);
      setConnecting(false);
      options.onConnected?.();
    });

    socket.on('disconnect', () => {
      setConnected(false);
      options.onDisconnected?.();
    });

    socket.on('new_message', (data: { message: MessageItem }) => {
      options.onMessage?.(data.message);
    });

    socket.on('new_group_message', (data: { message: GroupMessageItem }) => {
      options.onGroupMessage?.(data.message);
    });

    socket.on('message_delivered', (data: { messageId: string; status: string }) => {
      options.onMessageDelivered?.(data.messageId);
    });

    socket.on('messages_read', (data: { readerId: string }) => {
      options.onMessageRead?.(data.readerId);
    });

    socket.on('user_status', (data: { userId: string; online: boolean }) => {
      options.onUserStatus?.(data.userId, data.online);
    });

    socket.on('user_typing', (data: { userId: string; isTyping: boolean }) => {
      options.onUserTyping?.(data.userId, data.isTyping);
    });

    socket.on('message_recalled', (data: { messageId: string }) => {
      options.onRecall?.(data.messageId);
    });

    socket.on('group_message_recalled', (data: { groupId: string; messageId: string }) => {
      options.onGroupRecall?.(data.groupId, data.messageId);
    });

    socketRef.current = socket;
  }, [connecting, options]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, []);

  const sendMessage = useCallback(
    (receiverId: string, msgType: string, encryptedContent: string, iv: string) => {
      if (!socketRef.current?.connected) return false;
      socketRef.current.emit('send_message', { receiverId, msgType, encryptedContent, iv });
      return true;
    },
    [],
  );

  const sendGroupMessage = useCallback(
    (groupId: string, msgType: string, encryptedContent: string, iv: string) => {
      if (!socketRef.current?.connected) return false;
      socketRef.current.emit('send_group_message', { groupId, msgType, encryptedContent, iv });
      return true;
    },
    [],
  );

  const markRead = useCallback(
    (friendId: string) => {
      if (!socketRef.current?.connected) return;
      socketRef.current.emit('mark_read', { friendId });
    },
    [],
  );

  const sendTyping = useCallback(
    (friendId: string, isTyping: boolean) => {
      if (!socketRef.current?.connected) return;
      socketRef.current.emit('typing', { friendId, isTyping });
    },
    [],
  );

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connected,
    connecting,
    connect,
    disconnect,
    sendMessage,
    sendGroupMessage,
    markRead,
    sendTyping,
  };
}
