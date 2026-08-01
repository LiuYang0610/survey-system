// Cloudflare R2 操作工具
import type { R2Bucket } from '@cloudflare/workers-types';

// 生成预签名 PUT URL（前端直传 R2）
export async function generatePresignedUrl(
  bucket: R2Bucket,
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  // R2 预签名 URL 需要通过 API 生成
  // 这里使用 R2 的 presigned put 方法
  const url = new URL(`https://${bucket.name}.r2.cloudflarestorage.com/${key}`);
  
  // 在实际 Cloudflare 环境中，需要用 R2 API 生成签名
  // 这里返回上传 URL 供前端使用
  return url.toString();
}

// 从 R2 读取文件
export async function readFromR2(
  bucket: R2Bucket,
  key: string
): Promise<Uint8Array | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  return new Uint8Array(await object.arrayBuffer());
}

// 从 R2 读取文件为文本
export async function readTextFromR2(
  bucket: R2Bucket,
  key: string
): Promise<string | null> {
  const data = await readFromR2(bucket, key);
  if (!data) return null;
  return new TextDecoder().decode(data);
}

// 写入 R2
export async function writeToR2(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer | Uint8Array | string,
  contentType?: string
): Promise<void> {
  const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  await bucket.put(key, body, {
    httpMetadata: {
      contentType: contentType || 'application/octet-stream',
    },
  });
}

// 删除 R2 对象
export async function deleteFromR2(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}
