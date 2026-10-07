import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../api/chat';

export function useChatSocket(options = {}) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 10;

  const connect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) return;
    if (connecting) return;

    const token = getAuthToken();
    if (!token) return;

    setConnecting(true);

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${location.host}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      reconnectAttemptsRef.current = 0;
      options.onConnected?.();
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      options.onDisconnected?.();
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(1000 * reconnectAttemptsRef.current, 10000);
        reconnectTimerRef.current = setTimeout(() => {
          if (getAuthToken()) connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      // Handled by onclose
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'message':
            options.onMessage?.(msg.data.message || msg.data);
            break;
          case 'group_message':
            options.onGroupMessage?.(msg.data.message || msg.data);
            break;
          case 'status_update':
            options.onMessageDelivered?.(msg.data.messageId);
            break;
          case 'read_receipt':
            options.onMessageRead?.(msg.data.readerId);
            break;
          case 'user_status':
            options.onUserStatus?.(msg.data.userId, msg.data.online);
            break;
          case 'typing':
            options.onUserTyping?.(msg.data.userId, msg.data.isTyping);
            break;
          case 'recall':
            options.onRecall?.(msg.data.messageId);
            break;
          case 'group_recall':
            options.onGroupRecall?.(msg.data.groupId, msg.data.messageId);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };
  }, [connecting, options]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
      setConnected(false);
    }
  }, []);

  const sendMessage = useCallback(
    (receiverId, msgType, encryptedContent, iv) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return false;
      socketRef.current.send(
        JSON.stringify({
          type: 'send_message',
          data: { receiverId, msgType, encryptedContent, iv },
        }),
      );
      return true;
    },
    [],
  );

  const sendGroupMessage = useCallback(
    (groupId, msgType, encryptedContent, iv) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return false;
      socketRef.current.send(
        JSON.stringify({
          type: 'send_group_message',
          data: { groupId, msgType, encryptedContent, iv },
        }),
      );
      return true;
    },
    [],
  );

  const markRead = useCallback(
    (friendId) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
      socketRef.current.send(
        JSON.stringify({ type: 'mark_read', data: { friendId } }),
      );
    },
    [],
  );

  const sendTyping = useCallback(
    (friendId, isTyping) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
      socketRef.current.send(
        JSON.stringify({ type: 'typing', data: { friendId, isTyping } }),
      );
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
