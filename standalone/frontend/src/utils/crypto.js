export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey'],
  );
}

export async function exportPublicKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToBase64(raw);
}

export async function importPublicKey(base64Key) {
  const raw = base64ToBuffer(base64Key);
  return crypto.subtle.importKey(
    'raw',
    raw,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    [],
  );
}

export async function deriveSharedKey(privateKey, publicKey) {
  return crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptWithPassword(privateKey, password) {
  const keyData = await crypto.subtle.exportKey('pkcs8', privateKey);
  const key = await deriveKeyFromPassword(password, 'encryption-salt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    keyData,
  );
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  return bufferToBase64(result.buffer);
}

export async function decryptPrivateKey(encryptedData, password) {
  const data = base64ToBuffer(encryptedData);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const key = await deriveKeyFromPassword(password, 'encryption-salt');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return crypto.subtle.importKey(
    'pkcs8',
    decrypted,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
}

export async function encryptMessage(sharedKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoded,
  );
  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv.buffer),
  };
}

export async function decryptMessage(sharedKey, ciphertext, ivBase64) {
  const iv = base64ToBuffer(ivBase64);
  const data = base64ToBuffer(ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    data,
  );
  return new TextDecoder().decode(decrypted);
}

export async function encryptFile(sharedKey, file) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    fileBuffer,
  );
  return {
    encryptedData: encrypted,
    iv: bufferToBase64(iv.buffer),
  };
}

export async function decryptFile(sharedKey, encryptedData, ivBase64) {
  const iv = base64ToBuffer(ivBase64);
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encryptedData,
  );
}

async function deriveKeyFromPassword(password, salt) {
  const encoded = new TextEncoder().encode(password);
  const saltBuffer = new TextEncoder().encode(salt);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoded,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
