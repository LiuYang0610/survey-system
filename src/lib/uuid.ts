// UUID v4 生成（不依赖 crypto.randomUUID 的兼容实现）
export function generateId(): string {
  return crypto.randomUUID();
}

// 生成短唯一键（问卷访问链接用）
export function generateUniqueKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}
