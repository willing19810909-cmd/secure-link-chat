import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Sidebar from '../../components/chat/Sidebar';
import ChatWindow from '../../components/chat/ChatWindow';
import { useAuth } from '../../contexts/AuthContext';
import { chatApi } from '../../api';
import { useChatSocket } from '../../hooks/useChatSocket';
import type {
  FriendItem,
  FriendRequestItem,
  MessageItem,
  GroupItem,
  GroupMessageItem,
} from '@shared/api.interface';
import { logger } from '@lark-apaas/client-toolkit/logger';

export default function ChatPage() {
  const { user, loading, privateKey } = useAuth();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequestItem[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
  const [activeTab, setActiveTab] = useState<'friends' | 'groups'>('friends');
  const [newMessage, setNewMessage] = useState<MessageItem | null>(null);
  const [newGroupMessage, setNewGroupMessage] = useState<GroupMessageItem | null>(null);
  const [recalledMessageId, setRecalledMessageId] = useState<string | null>(null);
  const [recalledGroupMessageId, setRecalledGroupMessageId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const loadData = useCallback(async () => {
    try {
      const [friendsData, requestsData, groupsData] = await Promise.all([
        chatApi.getFriends(),
        chatApi.getFriendRequests(),
        chatApi.getMyGroups().catch(() => []),
      ]);
      setFriends(friendsData || []);
      setPendingRequests(requestsData || []);
      setGroups(groupsData || []);
    } catch (error) {
      logger.error('加载数据失败', String(error));
    }
  }, []);

  const handleMessage = useCallback((message: MessageItem) => {
    setNewMessage(message);
    if (message.senderId !== user?.id) {
      chatApi.markAsRead(message.senderId).catch(() => {});
    }
  }, [user?.id]);

  const handleGroupMessage = useCallback((message: GroupMessageItem) => {
    setNewGroupMessage(message);
  }, []);

  const handleRecall = useCallback((messageId: string) => {
    setRecalledMessageId(messageId);
  }, []);

  const handleGroupRecall = useCallback((groupId: string, messageId: string) => {
    if (selectedGroup?.group.id === groupId) {
      setRecalledGroupMessageId(messageId);
    }
  }, [selectedGroup?.group.id]);

  const { connected, connect, sendMessage, sendGroupMessage, markRead } = useChatSocket({
    onMessage: handleMessage,
    onGroupMessage: handleGroupMessage,
    onRecall: handleRecall,
    onGroupRecall: handleGroupRecall,
    onConnected: () => {
      loadData();
    },
  });

  useEffect(() => {
    if (user && privateKey) {
      connect();
      loadData();
    }
  }, [user, privateKey, connect, loadData]);

  const handleSelectFriend = (friend: FriendItem) => {
    setSelectedFriend(friend);
    setSelectedGroup(null);
    setMobileView('chat');
    markRead(friend.friendId);
  };

  const handleSelectGroup = (group: GroupItem) => {
    setSelectedGroup(group);
    setSelectedFriend(null);
    setMobileView('chat');
  };

  // Look up group owner's public key from friends list
  const groupOwnerPublicKey = selectedGroup
    ? friends.find((f) => f.friendId === selectedGroup.group.ownerId)?.friend.publicKey
    : undefined;

  const handleSwitchTab = (tab: 'friends' | 'groups') => {
    setActiveTab(tab);
  };

  const handleAcceptRequest = async (id: string) => {
    try {
      await chatApi.acceptFriendRequest(id);
      await loadData();
    } catch (error) {
      logger.error('接受请求失败', String(error));
    }
  };

  const handleRejectRequest = async (id: string) => {
    try {
      await chatApi.rejectFriendRequest(id);
      await loadData();
    } catch (error) {
      logger.error('拒绝请求失败', String(error));
    }
  };

  const handleBack = () => {
    setMobileView('list');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="h-screen w-screen bg-slate-900 overflow-hidden">
      {/* 桌面端布局 */}
      <div className="hidden md:flex h-full">
        <div className="w-80 flex-shrink-0">
          <Sidebar
            friends={friends}
            groups={groups}
            selectedFriendId={selectedFriend?.friendId || null}
            selectedGroupId={selectedGroup?.group.id || null}
            activeTab={activeTab}
            onSelectFriend={handleSelectFriend}
            onSelectGroup={handleSelectGroup}
            onSwitchTab={handleSwitchTab}
            pendingRequests={pendingRequests}
            onAcceptRequest={handleAcceptRequest}
            onRejectRequest={handleRejectRequest}
            connected={connected}
            onRefresh={loadData}
          />
        </div>
        <div className="flex-1">
          <ChatWindow
            friend={selectedFriend}
            group={selectedGroup}
            groupOwnerPublicKey={groupOwnerPublicKey}
            onBack={handleBack}
            sendWsMessage={sendMessage}
            sendGroupWsMessage={sendGroupMessage}
            newMessage={newMessage}
            newGroupMessage={newGroupMessage}
            recalledMessageId={recalledMessageId}
            recalledGroupMessageId={recalledGroupMessageId}
          />
        </div>
      </div>

      {/* 移动端布局 */}
      <div className="md:hidden h-full">
        {mobileView === 'list' ? (
          <div className="h-full">
            <Sidebar
              friends={friends}
              groups={groups}
              selectedFriendId={selectedFriend?.friendId || null}
              selectedGroupId={selectedGroup?.group.id || null}
              activeTab={activeTab}
              onSelectFriend={handleSelectFriend}
              onSelectGroup={handleSelectGroup}
              onSwitchTab={handleSwitchTab}
              pendingRequests={pendingRequests}
              onAcceptRequest={handleAcceptRequest}
              onRejectRequest={handleRejectRequest}
              connected={connected}
              onRefresh={loadData}
            />
          </div>
        ) : (
          <div className="h-full">
            <ChatWindow
              friend={selectedFriend}
              group={selectedGroup}
              groupOwnerPublicKey={groupOwnerPublicKey}
              onBack={handleBack}
              sendWsMessage={sendMessage}
              sendGroupWsMessage={sendGroupMessage}
              newMessage={newMessage}
              newGroupMessage={newGroupMessage}
              recalledMessageId={recalledMessageId}
              recalledGroupMessageId={recalledGroupMessageId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
