import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Image as ImageIcon,
  Video,
  Shield,
  MoreVertical,
  ArrowLeft,
  Upload,
  X,
  UserMinus,
  Edit3,
  Check,
  CheckCheck,
  Mic,
  MicOff,
  Play,
  Pause,
  RotateCcw,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { chatApi } from '../../api';
import { encryptMessage, decryptMessage, encryptFile, decryptFile, bufferToBase64, base64ToBuffer } from '../../utils/crypto';
import type {
  FriendItem,
  MessageItem,
  MessageStatus,
  MessageType,
  GroupItem,
  GroupMessageItem,
} from '@shared/api.interface';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { showConfirm } from '@lark-apaas/client-toolkit';
import { Image } from '@client/src/components/ui/image';

interface ChatWindowProps {
  friend: FriendItem | null;
  group?: GroupItem | null;
  groupOwnerPublicKey?: string;
  onBack: () => void;
  sendWsMessage: (
    receiverId: string,
    msgType: string,
    encryptedContent: string,
    iv: string,
  ) => boolean;
  sendGroupWsMessage?: (
    groupId: string,
    msgType: string,
    encryptedContent: string,
    iv: string,
  ) => boolean;
  newMessage: MessageItem | null;
  newGroupMessage: GroupMessageItem | null;
  recalledMessageId: string | null;
  recalledGroupMessageId: string | null;
}

interface DecryptedMessage {
  id: string;
  senderId: string;
  receiverId?: string;
  groupId?: string;
  senderUsername?: string;
  msgType: MessageType;
  encryptedContent: string;
  iv?: string;
  status: MessageStatus;
  createdAt: string;
  isRecalled?: boolean;
  recalledAt?: string;
  decryptedContent?: string;
  fileUrl?: string;
}

const RECALL_WINDOW_MS = 2 * 60 * 1000;

export default function ChatWindow({
  friend,
  group,
  groupOwnerPublicKey,
  onBack,
  sendWsMessage,
  sendGroupWsMessage,
  newMessage,
  newGroupMessage,
  recalledMessageId,
  recalledGroupMessageId,
}: ChatWindowProps) {
  const { user, getSharedKey } = useAuth();
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRemarkDialog, setShowRemarkDialog] = useState(false);
  const [remarkText, setRemarkText] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [decrypting, setDecrypting] = useState(true);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Voice playback state (per-message tracking via ref map)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [durationMap, setDurationMap] = useState<Record<string, number>>({});

  // Message action menu (per-message recall)
  const [activeMsgMenuId, setActiveMsgMenuId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const isGroupMode = !!group;
  const activeId = group?.group.id || friend?.friendId || '';

  // Get shared key for encryption/decryption
  const getCurrentSharedKey = useCallback(async (): Promise<CryptoKey> => {
    if (group) {
      // Group mode: use owner's shared key (simplified - all members share group key via owner)
      if (!groupOwnerPublicKey) {
        throw new Error('群主公钥未找到，无法解密群消息');
      }
      return getSharedKey(group.group.ownerId, groupOwnerPublicKey);
    }
    if (friend) {
      return getSharedKey(friend.friendId, friend.friend.publicKey);
    }
    throw new Error('无可用会话');
  }, [group, friend, groupOwnerPublicKey, getSharedKey]);

  const decryptMessageItem = useCallback(
    async (msg: DecryptedMessage, sharedKey: CryptoKey): Promise<DecryptedMessage> => {
      const item: DecryptedMessage = { ...msg };
      if (msg.isRecalled) return item;
      try {
        if (msg.msgType === 'text') {
          item.decryptedContent = await decryptMessage(
            sharedKey,
            msg.encryptedContent,
            msg.iv || '',
          );
        } else if (msg.msgType === 'image' || msg.msgType === 'video' || msg.msgType === 'voice') {
          const encryptedBuffer = base64ToBuffer(msg.encryptedContent);
          const decryptedBuffer = await decryptFile(
            sharedKey,
            encryptedBuffer,
            msg.iv || '',
          );
          let mimeType = 'application/octet-stream';
          if (msg.msgType === 'image') mimeType = 'image/*';
          else if (msg.msgType === 'video') mimeType = 'video/*';
          else if (msg.msgType === 'voice') mimeType = 'audio/webm';
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          item.fileUrl = URL.createObjectURL(blob);
        }
      } catch {
        item.decryptedContent = '[解密失败]';
      }
      return item;
    },
    [],
  );

  const loadMessages = useCallback(
    async (cursor?: string, append: boolean = false) => {
      if (!isGroupMode && !friend) return;
      if (isGroupMode && !group) return;
      setLoading(true);
      try {
        const sharedKey = await getCurrentSharedKey();
        let resultItems: DecryptedMessage[] = [];
        let resultHasMore = false;
        let resultNextCursor: string | undefined;

        if (isGroupMode && group) {
          const result = await chatApi.getGroupMessages(group.group.id, 50, cursor);
          resultItems = result.items.map((m: GroupMessageItem) => ({
            id: m.id,
            senderId: m.senderId,
            groupId: m.groupId,
            senderUsername: m.senderUsername,
            msgType: m.msgType,
            encryptedContent: m.encryptedContent,
            iv: m.iv,
            status: m.status,
            createdAt: m.createdAt,
            isRecalled: m.isRecalled,
            recalledAt: m.recalledAt,
          }));
          resultHasMore = result.hasMore;
          resultNextCursor = result.nextCursor;
        } else if (friend) {
          const result = await chatApi.getMessages(friend.friendId, 50, cursor);
          resultItems = result.items.map((m: MessageItem) => ({
            id: m.id,
            senderId: m.senderId,
            receiverId: m.receiverId,
            msgType: m.msgType,
            encryptedContent: m.encryptedContent,
            iv: m.iv,
            status: m.status,
            createdAt: m.createdAt,
            isRecalled: m.isRecalled,
            recalledAt: m.recalledAt,
          }));
          resultHasMore = result.hasMore;
          resultNextCursor = result.nextCursor;
        }

        const decrypted: DecryptedMessage[] = [];
        for (const msg of resultItems) {
          decrypted.push(await decryptMessageItem(msg, sharedKey));
        }

        if (append) {
          setMessages((prev) => [...decrypted, ...prev]);
        } else {
          setMessages(decrypted);
        }
        setHasMore(resultHasMore);
        setNextCursor(resultNextCursor);
      } catch (error) {
        logger.error('加载消息失败', String(error));
      } finally {
        setLoading(false);
        setDecrypting(false);
      }
    },
    [isGroupMode, friend, group, getCurrentSharedKey, decryptMessageItem],
  );

  useEffect(() => {
    if (isGroupMode ? group : friend) {
      setMessages([]);
      setDecrypting(true);
      setPlayingId(null);
      setProgressMap({});
      setDurationMap({});
      loadMessages();
    }
  }, [isGroupMode, group?.group.id, friend?.friendId, loadMessages]);

  // Handle new single-chat message
  useEffect(() => {
    if (!newMessage || !friend || isGroupMode) return;
    if (
      (newMessage.senderId === friend.friendId && newMessage.receiverId === user?.id) ||
      (newMessage.receiverId === friend.friendId && newMessage.senderId === user?.id)
    ) {
      const addMessage = async () => {
        try {
          const sharedKey = await getSharedKey(
            friend.friendId,
            friend.friend.publicKey,
          );
          const base: DecryptedMessage = {
            id: newMessage.id,
            senderId: newMessage.senderId,
            receiverId: newMessage.receiverId,
            msgType: newMessage.msgType,
            encryptedContent: newMessage.encryptedContent,
            iv: newMessage.iv,
            status: newMessage.status,
            createdAt: newMessage.createdAt,
            isRecalled: newMessage.isRecalled,
            recalledAt: newMessage.recalledAt,
          };
          const item = await decryptMessageItem(base, sharedKey);
          setMessages((prev) => [...prev, item]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: newMessage.id,
              senderId: newMessage.senderId,
              receiverId: newMessage.receiverId,
              msgType: newMessage.msgType,
              encryptedContent: newMessage.encryptedContent,
              iv: newMessage.iv,
              status: newMessage.status,
              createdAt: newMessage.createdAt,
              decryptedContent: '[解密失败]',
            },
          ]);
        }
      };
      addMessage();
    }
  }, [newMessage, friend, user?.id, getSharedKey, decryptMessageItem, isGroupMode]);

  // Handle new group message
  useEffect(() => {
    if (!newGroupMessage || !group || !isGroupMode) return;
    if (newGroupMessage.groupId !== group.group.id) return;
    const addMessage = async () => {
      try {
        const sharedKey = await getCurrentSharedKey();
        const base: DecryptedMessage = {
          id: newGroupMessage.id,
          senderId: newGroupMessage.senderId,
          groupId: newGroupMessage.groupId,
          senderUsername: newGroupMessage.senderUsername,
          msgType: newGroupMessage.msgType,
          encryptedContent: newGroupMessage.encryptedContent,
          iv: newGroupMessage.iv,
          status: newGroupMessage.status,
          createdAt: newGroupMessage.createdAt,
          isRecalled: newGroupMessage.isRecalled,
          recalledAt: newGroupMessage.recalledAt,
        };
        const item = await decryptMessageItem(base, sharedKey);
        setMessages((prev) => [...prev, item]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: newGroupMessage.id,
            senderId: newGroupMessage.senderId,
            groupId: newGroupMessage.groupId,
            senderUsername: newGroupMessage.senderUsername,
            msgType: newGroupMessage.msgType,
            encryptedContent: newGroupMessage.encryptedContent,
            iv: newGroupMessage.iv,
            status: newGroupMessage.status,
            createdAt: newGroupMessage.createdAt,
            decryptedContent: '[解密失败]',
          },
        ]);
      }
    };
    addMessage();
  }, [newGroupMessage, group, isGroupMode, getCurrentSharedKey, decryptMessageItem]);

  // Handle single-chat recall
  useEffect(() => {
    if (!recalledMessageId || isGroupMode) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === recalledMessageId ? { ...m, isRecalled: true } : m,
      ),
    );
  }, [recalledMessageId, isGroupMode]);

  // Handle group recall
  useEffect(() => {
    if (!recalledGroupMessageId || !isGroupMode) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === recalledGroupMessageId ? { ...m, isRecalled: true } : m,
      ),
    );
  }, [recalledGroupMessageId, isGroupMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Voice recording ---
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeTypes = ['audio/webm', 'audio/ogg', 'audio/webm;codecs=opus'];
      const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (error) {
      logger.error('无法启动录音', String(error));
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    return new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        resolve(blob);
      };
      recorder.stop();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
    });
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recordedChunksRef.current = [];
      };
      recorder.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  const handleMicClick = useCallback(async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (blob && blob.size > 0) {
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type });
        await handleFileUpload(file, 'voice');
      }
      setRecordingDuration(0);
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- Send helpers ---
  const sendTextMessage = async () => {
    if (!inputText.trim() || !user) return;
    if (!isGroupMode && !friend) return;
    if (isGroupMode && !group) return;
    const text = inputText.trim();
    setInputText('');

    try {
      const sharedKey = await getCurrentSharedKey();
      const { ciphertext, iv } = await encryptMessage(sharedKey, text);

      const tempId = `temp_${Date.now()}`;
      const baseMsg: DecryptedMessage = {
        id: tempId,
        senderId: user.id,
        msgType: 'text',
        encryptedContent: ciphertext,
        iv,
        status: 'sending',
        createdAt: new Date().toISOString(),
        decryptedContent: text,
      };
      if (isGroupMode && group) {
        baseMsg.groupId = group.group.id;
        baseMsg.senderUsername = user.username;
      } else if (friend) {
        baseMsg.receiverId = friend.friendId;
      }

      setMessages((prev) => [...prev, baseMsg]);

      let wsSent = false;
      if (isGroupMode && group && sendGroupWsMessage) {
        wsSent = sendGroupWsMessage(group.group.id, 'text', ciphertext, iv);
        if (!wsSent) {
          const result = await chatApi.sendGroupMessage(group.group.id, 'text', ciphertext, iv);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    id: result.id,
                    status: result.status,
                    createdAt: result.createdAt,
                  }
                : m,
            ),
          );
        }
      } else if (friend) {
        wsSent = sendWsMessage(friend.friendId, 'text', ciphertext, iv);
        if (!wsSent) {
          const result = await chatApi.sendMessage(friend.friendId, 'text', ciphertext, iv);
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...result, decryptedContent: text } : m)),
          );
        }
      }
    } catch (error) {
      logger.error('发送失败', String(error));
    }
  };

  const handleFileUpload = async (file: File, type: 'image' | 'video' | 'voice') => {
    if (!user) return;
    if (!isGroupMode && !friend) return;
    if (isGroupMode && !group) return;

    try {
      setUploadProgress(0);
      const sharedKey = await getCurrentSharedKey();

      const { encryptedData, iv } = await encryptFile(sharedKey, file);
      setUploadProgress(50);

      const base64Data = bufferToBase64(encryptedData);
      setUploadProgress(80);

      const tempId = `temp_${Date.now()}`;
      const fileUrl = URL.createObjectURL(file);

      const baseMsg: DecryptedMessage = {
        id: tempId,
        senderId: user.id,
        msgType: type,
        encryptedContent: base64Data,
        iv,
        status: 'sending',
        createdAt: new Date().toISOString(),
        fileUrl,
      };
      if (isGroupMode && group) {
        baseMsg.groupId = group.group.id;
        baseMsg.senderUsername = user.username;
      } else if (friend) {
        baseMsg.receiverId = friend.friendId;
      }

      setMessages((prev) => [...prev, baseMsg]);

      if (isGroupMode && group && sendGroupWsMessage) {
        const wsSent = sendGroupWsMessage(group.group.id, type, base64Data, iv);
        if (!wsSent) {
          const result = await chatApi.sendGroupMessage(group.group.id, type, base64Data, iv);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, id: result.id, status: result.status, createdAt: result.createdAt }
                : m,
            ),
          );
        }
      } else if (friend) {
        const wsSent = sendWsMessage(friend.friendId, type, base64Data, iv);
        if (!wsSent) {
          const result = await chatApi.sendMessage(friend.friendId, type, base64Data, iv);
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...result, fileUrl } : m)),
          );
        }
      }

      setUploadProgress(100);
      setTimeout(() => setUploadProgress(null), 500);
    } catch (error) {
      logger.error('上传失败', String(error));
      setUploadProgress(null);
    }
  };

  // --- Recall ---
  const canRecall = (msg: DecryptedMessage) => {
    if (msg.senderId !== user?.id) return false;
    if (msg.isRecalled) return false;
    const age = Date.now() - new Date(msg.createdAt).getTime();
    return age < RECALL_WINDOW_MS;
  };

  const handleRecall = async (msgId: string) => {
    setActiveMsgMenuId(null);
    if (await showConfirm('确定要撤回这条消息吗？')) {
      try {
        if (isGroupMode && group) {
          await chatApi.recallGroupMessage(group.group.id, msgId);
        } else if (friend) {
          await chatApi.recallMessage(msgId);
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, isRecalled: true } : m)),
        );
      } catch (error) {
        logger.error('撤回失败', String(error));
      }
    }
  };

  // --- Voice playback ---
  const handlePlayVoice = useCallback(
    (msgId: string, fileUrl: string) => {
      // Pause currently playing
      if (playingId && playingId !== msgId) {
        const prevAudio = audioRefs.current.get(playingId);
        if (prevAudio) prevAudio.pause();
      }

      let audio = audioRefs.current.get(msgId);
      if (!audio) {
        audio = new Audio(fileUrl);
        audioRefs.current.set(msgId, audio);

        audio.addEventListener('timeupdate', () => {
          if (audio) {
            setProgressMap((prev) => ({ ...prev, [msgId]: audio!.currentTime }));
          }
        });

        audio.addEventListener('loadedmetadata', () => {
          if (audio) {
            setDurationMap((prev) => ({ ...prev, [msgId]: audio!.duration }));
          }
        });

        audio.addEventListener('ended', () => {
          setPlayingId(null);
          setProgressMap((prev) => ({ ...prev, [msgId]: 0 }));
        });
      }

      if (audio.paused) {
        audio.play().catch((err) => logger.error('播放失败', String(err)));
        setPlayingId(msgId);
      } else {
        audio.pause();
        setPlayingId(null);
      }
    },
    [playingId],
  );

  // Cleanup audio elements on unmount
  useEffect(() => {
    return () => {
      audioRefs.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audioRefs.current.clear();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleDeleteFriend = async () => {
    if (!friend) return;
    if (await showConfirm('确定要删除该好友吗？聊天记录将同时删除。')) {
      try {
        await chatApi.deleteFriend(friend.friendId);
        onBack();
      } catch (error) {
        logger.error('删除失败', String(error));
      }
    }
    setShowMenu(false);
  };

  const handleUpdateRemark = async () => {
    if (!friend) return;
    try {
      await chatApi.updateRemark(friend.friendId, remarkText);
      setShowRemarkDialog(false);
      setShowMenu(false);
      window.location.reload();
    } catch (error) {
      logger.error('修改备注失败', String(error));
    }
  };

  const renderMessageStatus = (status: MessageStatus) => {
    switch (status) {
      case 'sending':
        return <span className="text-xs text-slate-500">发送中...</span>;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-slate-500" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-primary" />;
      default:
        return null;
    }
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  if (!friend && !group) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-900/50">
        <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mb-4">
          <Shield className="w-10 h-10 text-slate-600" />
        </div>
        <h2 className="text-xl text-slate-400 mb-2">选择一个好友或群组开始聊天</h2>
        <p className="text-sm text-slate-500">所有消息均已端到端加密</p>
      </div>
    );
  }

  const displayName = group
    ? group.group.name
    : friend
      ? friend.remarkName || friend.friend.username
      : '';

  const renderRecalledBubble = (msg: DecryptedMessage, isMine: boolean) => {
    let text = '';
    if (isMine) {
      text = '你撤回了一条消息';
    } else if (isGroupMode && msg.senderUsername) {
      text = `${msg.senderUsername} 撤回了一条消息`;
    } else {
      text = '对方撤回了一条消息';
    }
    return (
      <div className="flex justify-center">
        <span className="text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">
          {text}
        </span>
      </div>
    );
  };

  const renderVoiceBubble = (msg: DecryptedMessage, isMine: boolean) => {
    if (!msg.fileUrl) return null;
    const duration = durationMap[msg.id] || 0;
    const progress = progressMap[msg.id] || 0;
    const isPlaying = playingId === msg.id;

    return (
      <div
        className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl min-w-[140px] ${
          isMine
            ? 'bg-primary text-white rounded-br-md'
            : 'bg-slate-700 text-slate-100 rounded-bl-md'
        }`}
      >
        <button
          onClick={() => handlePlayVoice(msg.id, msg.fileUrl!)}
          className={`p-1.5 rounded-full transition-colors ${
            isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
        <div className="flex-1">
          <div className={`h-1 rounded-full ${isMine ? 'bg-white/20' : 'bg-slate-600'}`}>
            <div
              className={`h-full rounded-full transition-all ${isMine ? 'bg-white' : 'bg-primary'}`}
              style={{
                width: duration > 0 ? `${(progress / duration) * 100}%` : '0%',
              }}
            />
          </div>
        </div>
        <span className="text-xs text-slate-300 w-10 text-right">
          {formatDuration(duration)}
        </span>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/30">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
            {isGroupMode ? (
              <Users className="w-5 h-5 text-slate-300" />
            ) : (
              <span className="text-slate-200 font-medium">
                {displayName.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <div className="text-white font-medium flex items-center gap-2">
              {displayName}
              <Shield className="w-3.5 h-3.5 text-green-400" aria-label="已端到端加密" />
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-1">
              {isGroupMode && group ? (
                <>
                  <Users className="w-3 h-3" />
                  {group.group.memberCount} 位成员
                </>
              ) : friend ? (
                friend.friend.onlineStatus ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    在线
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    离线
                  </>
                )
              ) : null}
            </div>
          </div>
        </div>
        {!isGroupMode && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      setRemarkText(friend?.remarkName || '');
                      setShowRemarkDialog(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50"
                  >
                    <Edit3 className="w-4 h-4" />
                    修改备注
                  </button>
                  <button
                    onClick={handleDeleteFriend}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <UserMinus className="w-4 h-4" />
                    删除好友
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 加密提示条 */}
      <div className="px-4 py-2 bg-green-500/5 border-b border-green-500/10 text-center">
        <div className="inline-flex items-center gap-1.5 text-xs text-green-400">
          <Shield className="w-3.5 h-3.5" />
          <span>消息已端到端加密，只有会话成员可以读取</span>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {decrypting ? (
          <div className="text-center text-slate-500 py-8">
            <div className="text-sm">正在解密消息...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-sm">暂无消息</p>
            <p className="text-xs mt-1">发送第一条加密消息开始聊天</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === user?.id;
            if (msg.isRecalled) {
              return (
                <div key={msg.id}>
                  {renderRecalledBubble(msg, isMine)}
                </div>
              );
            }
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'} group relative`}
              >
                <div className={`max-w-[75%] ${isMine ? 'order-1' : ''}`}>
                  {/* Sender name for group messages (not mine) */}
                  {isGroupMode && !isMine && msg.senderUsername && (
                    <div className="text-xs text-slate-400 mb-1 ml-1">
                      {msg.senderUsername}
                    </div>
                  )}

                  {msg.msgType === 'text' ? (
                    <div
                      className={`px-4 py-2.5 rounded-2xl ${
                        isMine
                          ? 'bg-primary text-white rounded-br-md'
                          : 'bg-slate-700 text-slate-100 rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {msg.decryptedContent}
                      </p>
                    </div>
                  ) : msg.msgType === 'image' && msg.fileUrl ? (
                    <div
                      className={`rounded-xl overflow-hidden ${
                        isMine ? 'bg-primary/20' : 'bg-slate-700/50'
                      }`}
                    >
                      <Image
                        src={msg.fileUrl}
                        alt="图片消息"
                        className="max-w-xs max-h-64 object-contain"
                      />
                    </div>
                  ) : msg.msgType === 'video' && msg.fileUrl ? (
                    <div
                      className={`rounded-xl overflow-hidden ${
                        isMine ? 'bg-primary/20' : 'bg-slate-700/50'
                      }`}
                    >
                      <video
                        src={msg.fileUrl}
                        controls
                        className="max-w-xs max-h-64"
                      />
                    </div>
                  ) : msg.msgType === 'voice' && msg.fileUrl ? (
                    renderVoiceBubble(msg, isMine)
                  ) : null}

                  <div
                    className={`flex items-center gap-1 mt-1 ${
                      isMine ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span className="text-xs text-slate-500">
                      {formatTime(msg.createdAt)}
                    </span>
                    {isMine && renderMessageStatus(msg.status)}
                  </div>
                </div>

                {/* Message action menu for recall */}
                {canRecall(msg) && (
                  <div
                    className={`absolute top-0 ${
                      isMine ? 'right-full mr-1' : 'left-full ml-1'
                    } opacity-0 group-hover:opacity-100 transition-opacity`}
                  >
                    <div className="relative">
                      <button
                        onClick={() =>
                          setActiveMsgMenuId(activeMsgMenuId === msg.id ? null : msg.id)
                        }
                        className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {activeMsgMenuId === msg.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setActiveMsgMenuId(null)}
                          />
                          <div
                            className={`absolute top-full mt-1 ${
                              isMine ? 'right-0' : 'left-0'
                            } w-24 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-20 overflow-hidden`}
                          >
                            <button
                              onClick={() => handleRecall(msg.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700/50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              撤回
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 录音状态条 */}
      {isRecording && (
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                <Mic className="w-4 h-4 text-red-400 animate-pulse" />
              </div>
              <div>
                <div className="text-sm text-white font-medium">正在录音</div>
                <div className="text-xs text-slate-400">
                  时长 {formatDuration(recordingDuration)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelRecording}
                className="px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                取消
              </button>
              <button
                onClick={handleMicClick}
                className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1"
              >
                <Check className="w-4 h-4" />
                发送
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 上传进度 */}
      {uploadProgress !== null && (
        <div className="px-4 py-2 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-slate-400" />
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 w-10 text-right">
              {uploadProgress}%
            </span>
          </div>
        </div>
      )}

      {/* 输入框 */}
      {!isRecording && (
        <div className="p-3 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-end gap-2">
            <div className="flex gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                title="发送图片"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => videoInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                title="发送视频"
              >
                <Video className="w-5 h-5" />
              </button>
              <button
                onClick={handleMicClick}
                className={`p-2 rounded-lg transition-colors ${
                  isRecording
                    ? 'text-red-400 bg-red-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="语音消息"
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendTextMessage();
                  }
                }}
                placeholder="输入消息..."
                rows={1}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 resize-none text-sm"
                style={{ minHeight: '42px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={sendTextMessage}
              disabled={!inputText.trim()}
              className="p-2.5 bg-primary text-white rounded-full hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file, 'image');
          e.target.value = '';
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file, 'video');
          e.target.value = '';
        }}
      />

      {/* 修改备注弹窗 */}
      {showRemarkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-sm border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">修改备注</h3>
              <button
                onClick={() => setShowRemarkDialog(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
              placeholder="输入备注名"
              className="w-full px-3 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary mb-4"
            />
            <button
              onClick={handleUpdateRemark}
              className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

