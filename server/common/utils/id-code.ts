const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateIdCode(length: number = 8): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return result;
}
