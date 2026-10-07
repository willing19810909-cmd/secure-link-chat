import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Sidebar from '../../components/chat/Sidebar';
import ChatWindow from '../../components/chat/ChatWindow';
import { useAuth } from '../../contexts/AuthContext';
import * as chatApi from '../../api/chat';
import { useChatSocket } from '../../hooks/useChatSocket';

export default function ChatPage() {
  const { user, loading, privateKey } = useAuth();
  const navigate = useNavigate();
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('friends');
  const [newMessage, setNewMessage] = useState(null);
  const [newGroupMessage, setNewGroupMessage] = useState(null);
  const [recalledMessageId, setRecalledMessageId] = useState(null);
  const [recalledGroupMessageId, setRecalledGroupMessageId] = useState(null);
  const [mobileView, setMobileView] = useState('list');
  const lastNotifyTime = useRef(0);

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
      console.error('加载数据失败', String(error));
    }
  }, []);

    const handleMessage = useCallback((message) => {
    setNewMessage(message);
    if (message.senderId !== user?.id) {
      chatApi.markAsRead(message.senderId).catch(() => {});
    }

    // === 新增：伪装通知逻辑 ===
    const now = Date.now();
    if (document.hidden && Notification.permission === "granted") {
      if (now - lastNotifyTime.current > 3000) { // 3秒内只弹一次，防止轰炸
        lastNotifyTime.current = now;
        const notification = new Notification("计算器", {
          body: "后台计算任务已完成，点击查看结果",
          icon: "/icon-192.png",
          silent: false
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    }

    // 给应用图标加小红点
    if ("setAppBadge" in navigator) {
      navigator.setAppBadge(1).catch(() => {});
    }
    // =======================
  }, [user?.id]);

  const handleGroupMessage = useCallback((message) => {
  setNewGroupMessage(message);

  // === 新增：伪装通知逻辑 ===
  const now = Date.now();
  if (document.hidden && Notification.permission === "granted") {
    if (now - lastNotifyTime.current > 3000) {
      lastNotifyTime.current = now;
      const notification = new Notification("计算器", {
        body: "后台计算任务已完成，点击查看结果",
        icon: "/icon-192.png",
        silent: false
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }

  if ("setAppBadge" in navigator) {
    navigator.setAppBadge(1).catch(() => {});
  }
  // =======================
}, []);

  const handleRecall = useCallback((messageId) => {
    setRecalledMessageId(messageId);
  }, []);

  const handleGroupRecall = useCallback((groupId, messageId) => {
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
    // === 新增：申请通知权限 ===
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    // ======================

    // === 新增：当用户切回应用时，清除图标小红点 ===
    const handleFocus = () => {
      if ("clearAppBadge" in navigator) {
        navigator.clearAppBadge().catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);
    // ==========================================

    if (user && privateKey) {
      connect();
      loadData();
    }

    // 组件卸载时移除监听
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, privateKey, connect, loadData]);

  const handleSelectFriend = (friend) => {
    setSelectedFriend(friend);
    setSelectedGroup(null);
    setMobileView('chat');
    markRead(friend.friendId);
  };

  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
    setSelectedFriend(null);
    setMobileView('chat');
  };

  const groupOwnerPublicKey = selectedGroup
    ? friends.find((f) => f.friendId === selectedGroup.group.ownerId)?.friend.publicKey
    : undefined;

  const handleSwitchTab = (tab) => {
    setActiveTab(tab);
  };

  const handleAcceptRequest = async (id) => {
    try {
      await chatApi.acceptFriendRequest(id);
      await loadData();
    } catch (error) {
      console.error('接受请求失败', String(error));
    }
  };

  const handleRejectRequest = async (id) => {
    try {
      await chatApi.rejectFriendRequest(id);
      await loadData();
    } catch (error) {
      console.error('拒绝请求失败', String(error));
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
