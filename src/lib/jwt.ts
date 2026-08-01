// JWT 工具（Cloudflare Workers 兼容）
import type { JwtPayload } from '../types';

// Base64 URL 编码
function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(data: string): string {
  let str = data.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

// HMAC-SHA256 签名
async function hmacSign(key: CryptoKey, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

// 导入密钥
async function importKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// 签发 JWT
export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const key = await importKey(secret);
  const signature = await hmacSign(key, `${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

// 验证 JWT
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, body, signature] = parts;
    const key = await importKey(secret);
    const expectedSig = await hmacSign(key, `${header}.${body}`);
    
    if (signature !== expectedSig) return null;
    
    const payload: JwtPayload = JSON.parse(base64UrlDecode(body));
    
    // 检查过期
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    
    return payload;
  } catch {
    return null;
  }
}
