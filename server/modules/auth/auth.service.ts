import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import { chatUsers } from '../../database/schema';
import { generateIdCode } from '../../common/utils/id-code';
import type { ChatUser } from '@shared/api.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async register(
    username: string,
    password: string,
    publicKey: string,
    encryptedPrivateKey: string,
  ): Promise<{ user: ChatUser; token: string }> {
    let idCode: string;
    let attempts = 0;
    while (attempts < 10) {
      idCode = generateIdCode(8);
      const existing = await this.db
        .select()
        .from(chatUsers)
        .where(eq(chatUsers.idCode, idCode))
        .limit(1);
      if (existing.length === 0) break;
      attempts++;
    }

    const passwordHash = this.hashPassword(password);

    const [user] = await this.db
      .insert(chatUsers)
      .values({
        idCode: idCode!,
        username,
        passwordHash,
        publicKey,
        encryptedPrivateKey,
      })
      .returning();

    const token = this.generateToken(user.id);

    return {
      user: this.toChatUser(user),
      token,
    };
  }

  async login(
    idCode: string,
    password: string,
  ): Promise<{ user: ChatUser; token: string; encryptedPrivateKey: string }> {
    const [user] = await this.db
      .select()
      .from(chatUsers)
      .where(eq(chatUsers.idCode, idCode.toUpperCase()))
      .limit(1);

    if (!user) {
      throw new Error('用户不存在');
    }

    if (!this.verifyPassword(password, user.passwordHash)) {
      throw new Error('密码错误');
    }

    const token = this.generateToken(user.id);

    return {
      user: this.toChatUser(user),
      token,
      encryptedPrivateKey: user.encryptedPrivateKey,
    };
  }

  async getUserById(id: string): Promise<ChatUser | null> {
    const [user] = await this.db
      .select()
      .from(chatUsers)
      .where(eq(chatUsers.id, id))
      .limit(1);
    return user ? this.toChatUser(user) : null;
  }

  async getUserByIdCode(idCode: string): Promise<ChatUser | null> {
    const [user] = await this.db
      .select()
      .from(chatUsers)
      .where(eq(chatUsers.idCode, idCode.toUpperCase()))
      .limit(1);
    return user ? this.toChatUser(user) : null;
  }

  async updateOnlineStatus(userId: string, online: boolean): Promise<void> {
    await this.db
      .update(chatUsers)
      .set({
        onlineStatus: online,
        lastSeenAt: new Date(),
      })
      .where(eq(chatUsers.id, userId));
  }

  verifyToken(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [payload, signature] = parts;
      const expected = crypto
        .createHmac('sha256', this.getSecret())
        .update(payload)
        .digest('base64url');
      if (signature !== expected) return null;
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      if (data.exp < Date.now()) return null;
      return data.userId;
    } catch {
      return null;
    }
  }

  private generateToken(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({
        userId,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }),
    ).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.getSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, 'sha256')
      .toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    const inputHash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, 'sha256')
      .toString('hex');
    return hash === inputHash;
  }

  private getSecret(): string {
    return process.env.JWT_SECRET || 'enc-chat-secret-key-2024';
  }

  private toChatUser(row: typeof chatUsers.$inferSelect): ChatUser {
    return {
      id: row.id,
      idCode: row.idCode,
      username: row.username,
      publicKey: row.publicKey,
      onlineStatus: row.onlineStatus ?? false,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
