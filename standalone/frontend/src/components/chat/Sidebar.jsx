import { useState, useRef } from 'react';
import {
  Search,
  UserPlus,
  LogOut,
  Shield,
  Wifi,
  WifiOff,
  Copy,
  Check,
  Bell,
  X,
  UserMinus,
  Edit3,
  Users,
  User,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import * as chatApi from '../../api/chat';

export default function Sidebar({
  friends,
  groups,
  selectedFriendId,
  selectedGroupId,
  activeTab,
  onSelectFriend,
  onSelectGroup,
  onSwitchTab,
  pendingRequests,
  onAcceptRequest,
  onRejectRequest,
  connected,
  onRefresh,
}) {
  const { user, logout } = useAuth();
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [idCode, setIdCode] = useState('');
  const [addError, setAddError] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFriends = friends.filter((f) => {
    const name = f.remarkName || f.friend.username;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredGroups = groups.filter((g) =>
    g.group.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleAddFriend = async () => {
    setAddError('');
    try {
      await chatApi.addFriend(idCode.trim());
      setShowAddFriend(false);
      setIdCode('');
      onRefresh();
    } catch (err) {
      const msg = err.response?.data?.message;
      setAddError(msg || '添加失败');
    }
  };

  const copyIdCode = async () => {
    if (user) {
      await navigator.clipboard.writeText(user.idCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full flex flex-col bg-slate-800/50 border-r border-slate-700">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-3 flex-1 hover:bg-slate-700/50 rounded-lg p-2 -m-2 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-semibold text-sm">
                {user?.username?.charAt(0) || '?'}
              </span>
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="text-white font-medium truncate">
                {user?.username || '未登录'}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1">
                {connected ? (
                  <>
                    <Wifi className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">在线</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-slate-500" />
                    <span>离线</span>
                  </>
                )}
              </div>
            </div>
          </button>
          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {showProfile && user && (
          <div className="mt-3 p-3 bg-slate-700/30 rounded-lg">
            <div className="text-xs text-slate-400 mb-1">我的身份编码</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-primary tracking-wider">
                {user.idCode}
              </code>
              <button
                onClick={copyIdCode}
                className="p-1.5 text-slate-400 hover:text-white transition-colors"
                title="复制"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              分享此编码给好友，对方即可添加您
            </p>
          </div>
        )}
      </div>

      <div className="px-3 pt-3 border-b border-slate-700">
        <div className="flex gap-1 bg-slate-700/30 p-1 rounded-lg">
          <button
            onClick={() => onSwitchTab('friends')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'friends'
                ? 'bg-slate-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            好友
          </button>
          <button
            onClick={() => onSwitchTab('groups')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'groups'
                ? 'bg-slate-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            群组
          </button>
        </div>
      </div>

      <div className="p-3 border-b border-slate-700 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'friends' ? '搜索好友' : '搜索群组'}
            className="w-full pl-9 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary/50"
          />
        </div>
        {activeTab === 'friends' && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowAddFriend(true);
                setShowRequests(false);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              添加好友
            </button>
            <button
              onClick={() => {
                setShowRequests(!showRequests);
                setShowAddFriend(false);
              }}
              className="relative p-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {activeTab === 'friends' && showRequests && (
        <div className="border-b border-slate-700 max-h-48 overflow-y-auto">
          {pendingRequests.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              暂无好友请求
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-3 hover:bg-slate-700/30 border-b border-slate-700/50 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center">
                    <span className="text-slate-300 text-sm font-medium">
                      {req.sender.username.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">
                      {req.sender.username}
                    </div>
                    <div className="text-xs text-slate-500">
                      {req.sender.idCode}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onAcceptRequest(req.id)}
                      className="p-1.5 text-green-400 hover:bg-green-500/10 rounded transition-colors"
                      title="接受"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onRejectRequest(req.id)}
                      className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="拒绝"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'friends' ? (
          filteredFriends.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-slate-500 text-sm mb-2">暂无好友</div>
              <div className="text-xs text-slate-600">点击上方"添加好友"开始</div>
            </div>
          ) : (
            filteredFriends.map((friend) => (
              <button
                key={friend.friendId}
                onClick={() => onSelectFriend(friend)}
                className={`w-full p-3 flex items-center gap-3 border-b border-slate-700/30 transition-colors text-left ${
                  selectedFriendId === friend.friendId
                    ? 'bg-primary/10 border-l-2 border-l-primary'
                    : 'hover:bg-slate-700/30'
                }`}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
                    <span className="text-slate-200 font-medium">
                      {(friend.remarkName || friend.friend.username).charAt(0)}
                    </span>
                  </div>
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-800 ${
                      friend.friend.onlineStatus ? 'bg-green-500' : 'bg-slate-500'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium truncate">
                      {friend.remarkName || friend.friend.username}
                    </span>
                    <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                      {formatTime(friend.lastMessageTime)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">
                    {friend.lastMessage || '暂无消息'}
                  </div>
                </div>
                {friend.unreadCount > 0 && (
                  <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-xs text-white flex-shrink-0">
                    {friend.unreadCount > 99 ? '99+' : friend.unreadCount}
                  </div>
                )}
              </button>
            ))
          )
        ) : filteredGroups.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-500 text-sm mb-2">暂无群组</div>
            <div className="text-xs text-slate-600">与好友创建群组开始群聊</div>
          </div>
        ) : (
          filteredGroups.map((g) => (
            <button
              key={g.group.id}
              onClick={() => onSelectGroup(g)}
              className={`w-full p-3 flex items-center gap-3 border-b border-slate-700/30 transition-colors text-left ${
                selectedGroupId === g.group.id
                  ? 'bg-primary/10 border-l-2 border-l-primary'
                  : 'hover:bg-slate-700/30'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
                <Users className="w-5 h-5 text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white font-medium truncate">
                    {g.group.name}
                  </span>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                    {formatTime(g.lastMessageTime)}
                  </span>
                </div>
                <div className="text-xs text-slate-400 truncate mt-0.5">
                  {g.lastMessage || '暂无消息'}
                </div>
              </div>
              {g.unreadCount > 0 && (
                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-xs text-white flex-shrink-0">
                  {g.unreadCount > 99 ? '99+' : g.unreadCount}
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {showAddFriend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-sm border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">添加好友</h3>
              <button
                onClick={() => setShowAddFriend(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">
                  对方身份编码
                </label>
                <input
                  type="text"
                  value={idCode}
                  onChange={(e) => setIdCode(e.target.value.toUpperCase())}
                  placeholder="输入8位身份编码"
                  maxLength={12}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary font-mono tracking-wider"
                />
              </div>
              {addError && (
                <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                  {addError}
                </div>
              )}
              <button
                onClick={handleAddFriend}
                className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                发送好友请求
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
