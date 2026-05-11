import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'gf-atendimento-salt';

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, KEY_LENGTH) as Buffer;
}

export function encrypt(plaintext: string, appSecret: string): string {
  const key = deriveKey(appSecret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    tag.toString('base64url'),
  ].join(':');
}

export function decrypt(ciphertext: string, appSecret: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');

  const [ivB64, encB64, tagB64] = parts;
  const key = deriveKey(appSecret);
  const iv = Buffer.from(ivB64, 'base64url');
  const encrypted = Buffer.from(encB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return decipher.update(encrypted) + decipher.final('utf8');
}
