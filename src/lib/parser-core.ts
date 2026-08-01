// 通用文本解析逻辑
import type { ParsedQuestion } from '../types';

// 文本清洗：剔除空行、不可见特殊符号
export function cleanText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 零宽字符
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n');
}

// 从清洗后的文本中解析问卷
export function parseSurveyText(text: string): { title: string; description: string; questions: ParsedQuestion[] } {
  const cleaned = cleanText(text);
  const lines = cleaned.split('\n').filter(l => l.length > 0);
  
  if (lines.length === 0) {
    throw new Error('文档内容为空');
  }

  // 第一行 = 问卷名称
  const title = lines[0].replace(/^[#\s]+/, '').trim();
  let description = '';
  let questionStartIdx = 1;
  
  // 检查第二行是否为说明（非题号开头）
  if (lines.length > 1 && !/^\d+[、.．]/.test(lines[1])) {
    description = lines[1].trim();
    questionStartIdx = 2;
  }

  const questions: ParsedQuestion[] = [];
  let currentQuestion: ParsedQuestion | null = null;
  let currentOptions: string[] = [];

  // 正则匹配
  const questionRegex = /^(\d+)[、.．]\s*(.+)/;
  const typeRegex = /【(单选|多选|填空|量表)】/;
  const requiredRegex = /【必填】/;
  const optionRegex = /^[A-Za-z]\s*[、.．]\s*(.+)/;

  for (let i = questionStartIdx; i < lines.length; i++) {
    const line = lines[i];
    
    // 检查是否为新题目
    const qMatch = line.match(questionRegex);
    if (qMatch) {
      // 保存上一题
      if (currentQuestion) {
        currentQuestion.options = currentOptions;
        questions.push(currentQuestion);
      }
      
      const sortOrder = parseInt(qMatch[1]);
      let title = qMatch[2];
      let type: ParsedQuestion['type'] = 'single';
      let required = false;
      
      // 提取题型标记
      const typeMatch = title.match(typeRegex);
      if (typeMatch) {
        const typeMap: Record<string, ParsedQuestion['type']> = {
          '单选': 'single',
          '多选': 'multiple',
          '填空': 'text',
          '量表': 'scale',
        };
        type = typeMap[typeMatch[1]] || 'single';
        title = title.replace(typeRegex, '').trim();
      }
      
      // 提取必填标记
      if (requiredRegex.test(title)) {
        required = true;
        title = title.replace(requiredRegex, '').trim();
      }
      
      currentQuestion = {
        sort_order: sortOrder,
        type,
        title,
        description: '',
        required,
        options: [],
        scale_min: 1,
        scale_max: 5,
        scale_min_label: '非常不满意',
        scale_max_label: '非常满意',
      };
      currentOptions = [];
      continue;
    }
    
    // 检查是否为选项
    if (currentQuestion && optionRegex.test(line)) {
      const optMatch = line.match(optionRegex);
      if (optMatch) {
        currentOptions.push(optMatch[1].trim());
      }
      continue;
    }
    
    // 如果当前行看起来像选项内容（缩进或无标号）
    if (currentQuestion && currentQuestion.type !== 'text' && currentQuestion.type !== 'scale') {
      const trimmed = line.trim();
      if (trimmed && !/^\d+[、.．]/.test(trimmed)) {
        currentOptions.push(trimmed);
      }
    }
  }

  // 保存最后一题
  if (currentQuestion) {
    currentQuestion.options = currentOptions;
    questions.push(currentQuestion);
  }

  return { title, description, questions };
}
