import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login/LoginPage';
import ChatPage from './pages/Chat/ChatPage';

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">404</h1>
        <p className="text-slate-400 mb-4">页面不存在</p>
        <a href="/chat" className="text-primary hover:underline">返回聊天</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
