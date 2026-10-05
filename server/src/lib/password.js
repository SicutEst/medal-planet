import crypto from 'crypto';

// 密码哈希使用 Node 内置 scrypt，格式：scrypt:<salt hex>:<hash hex>
// 历史遗留的明文密码在首次登录校验成功后自动升级为哈希（透明迁移）

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored) return false;
  if (stored.startsWith('scrypt:')) {
    const [, salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(String(plain), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }
  // 旧明文密码
  return plain === stored;
}

export function needsRehash(stored) {
  return typeof stored !== 'string' || !stored.startsWith('scrypt:');
}
