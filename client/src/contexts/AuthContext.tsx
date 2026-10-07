import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  register as apiRegister,
  login as apiLogin,
  getMe as apiGetMe,
  onUnauthorized,
} from '../api/chat';
import {
  generateKeyPair,
  exportPublicKey,
  encryptWithPassword,
  decryptPrivateKey,
  importPublicKey,
  deriveSharedKey,
} from '../utils/crypto';
import type { ChatUser } from '@shared/api.interface';

interface AuthContextType {
  user: ChatUser | null;
  privateKey: CryptoKey | null;
  sharedKeys: Map<string, CryptoKey>;
  loading: boolean;
  register: (username: string, password: string) => Promise<void>;
  login: (idCode: string, password: string) => Promise<void>;
  logout: () => void;
  getSharedKey: (friendId: string, friendPublicKey: string) => Promise<CryptoKey>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PRIVATE_KEY_KEY = 'enc_chat_ek';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ChatUser | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [sharedKeys, setSharedKeys] = useState<Map<string, CryptoKey>>(new Map());
  const [loading, setLoading] = useState(true);

  const getSharedKey = useCallback(
    async (friendId: string, friendPublicKey: string): Promise<CryptoKey> => {
      const existing = sharedKeys.get(friendId);
      if (existing) return existing;

      if (!privateKey) {
        throw new Error('私钥未加载');
      }

      const pubKey = await importPublicKey(friendPublicKey);
      const shared = await deriveSharedKey(privateKey, pubKey);
      setSharedKeys((prev) => {
        const next = new Map(prev);
        next.set(friendId, shared);
        return next;
      });
      return shared;
    },
    [privateKey, sharedKeys],
  );

  const register = useCallback(async (username: string, password: string) => {
    const keyPair = await generateKeyPair();
    const publicKeyStr = await exportPublicKey(keyPair.publicKey);
    const encryptedPrivKey = await encryptWithPassword(keyPair.privateKey, password);

    const result = await apiRegister(username, password, publicKeyStr, encryptedPrivKey);
    setAuthToken(result.token);
    setUser(result.user);

    const decryptedKey = await decryptPrivateKey(encryptedPrivKey, password);
    setPrivateKey(decryptedKey);
  }, []);

  const login = useCallback(async (idCode: string, password: string) => {
    const result = await apiLogin(idCode, password);
    setAuthToken(result.token);
    setUser(result.user);

    try {
      const decryptedKey = await decryptPrivateKey(result.encryptedPrivateKey, password);
      setPrivateKey(decryptedKey);
    } catch (error) {
      logger.error('解密私钥失败', error);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    setPrivateKey(null);
    setSharedKeys(new Map());
    localStorage.removeItem(PRIVATE_KEY_KEY);
  }, []);

  useEffect(() => {
    const init = async () => {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const me = await apiGetMe();
        setUser(me);
      } catch (error) {
        logger.error('自动登录失败', error);
        clearAuthToken();
      } finally {
        setLoading(false);
      }
    };

    init();

    const unsubscribe = onUnauthorized(() => {
      clearAuthToken();
      setUser(null);
      setPrivateKey(null);
      setSharedKeys(new Map());
      localStorage.removeItem(PRIVATE_KEY_KEY);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, privateKey, sharedKeys, loading, register, login, logout, getSharedKey }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
