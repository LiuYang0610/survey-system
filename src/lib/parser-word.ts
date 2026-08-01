// Word (.docx) 文件解析器
import mammoth from 'mammoth';
import { parseSurveyText } from './parser-core';
import type { ParsedQuestion } from '../types';

export async function parseWord(buffer: ArrayBuffer): Promise<{
  title: string;
  description: string;
  questions: ParsedQuestion[];
}> {
  // 使用 mammoth 提取文本
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  
  if (result.messages.length > 0) {
    const errors = result.messages.filter(m => m.type === 'error');
    if (errors.length > 0) {
      throw new Error(`Word 文件解析错误: ${errors.map(e => e.message).join(', ')}`);
    }
  }
  
  const text = result.value;
  if (!text || text.trim().length === 0) {
    throw new Error('Word 文件内容为空');
  }
  
  return parseSurveyText(text);
}
