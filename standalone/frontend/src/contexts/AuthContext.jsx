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
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

const PRIVATE_KEY_KEY = 'enc_chat_ek';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const [sharedKeys, setSharedKeys] = useState(new Map());
  const [loading, setLoading] = useState(true);

  const getSharedKey = useCallback(
    async (friendId, friendPublicKey) => {
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

  const register = useCallback(async (username, password) => {
    const keyPair = await generateKeyPair();
    const publicKeyStr = await exportPublicKey(keyPair.publicKey);
    const encryptedPrivKey = await encryptWithPassword(keyPair.privateKey, password);

    const result = await apiRegister(username, password, publicKeyStr, encryptedPrivKey);
    setAuthToken(result.token);
    setUser(result.user);

    const decryptedKey = await decryptPrivateKey(encryptedPrivKey, password);
    setPrivateKey(decryptedKey);
  }, []);

  const login = useCallback(async (idCode, password) => {
    const result = await apiLogin(idCode, password);
    setAuthToken(result.token);
    setUser(result.user);

    try {
      const decryptedKey = await decryptPrivateKey(result.encryptedPrivateKey, password);
      setPrivateKey(decryptedKey);
    } catch (error) {
      console.error('解密私钥失败', error);
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
        console.error('自动登录失败', error);
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
