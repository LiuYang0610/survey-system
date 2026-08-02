// 解码 Unicode 转义序列
export function decodeUnicodeEscapes(str: string): string {
  if (!str) return str;
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });
}

// 深度解码对象中的所有字符串
export function deepDecodeUnicode(obj: any): any {
  if (typeof obj === 'string') {
    return decodeUnicodeEscapes(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepDecodeUnicode(item));
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = deepDecodeUnicode(obj[key]);
      }
    }
    return result;
  }
  return obj;
}
