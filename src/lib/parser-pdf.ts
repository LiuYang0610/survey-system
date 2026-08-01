// PDF 文件解析器（适配 Edge Runtime，无 Canvas 依赖）
import { parseSurveyText } from './parser-core';
import type { ParsedQuestion } from '../types';

export async function parsePdf(buffer: ArrayBuffer): Promise<{
  title: string;
  description: string;
  questions: ParsedQuestion[];
}> {
  try {
    // 尝试使用 unpdf（兼容 Edge Runtime）
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    
    const lines: string[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();
      
      if (pageText) {
        lines.push(pageText);
      }
    }
    
    if (lines.length === 0) {
      throw new Error('PDF 文件无法提取文本内容（可能是扫描件/图片PDF）');
    }
    
    return parseSurveyText(lines.join('\n'));
  } catch (error: any) {
    // 如果 unpdf 不可用，尝试直接解析文本
    if (error.message?.includes('无法提取文本')) {
      throw error;
    }
    throw new Error(`PDF 解析失败: ${error.message}。请确保 PDF 为可复制文本格式，非扫描件。`);
  }
}
