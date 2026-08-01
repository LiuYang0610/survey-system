// Excel (.xlsx) 文件解析器
import ExcelJS from 'exceljs';
import { parseSurveyText } from './parser-core';
import type { ParsedQuestion } from '../types';

export async function parseExcel(buffer: ArrayBuffer): Promise<{
  title: string;
  description: string;
  questions: ParsedQuestion[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Excel 文件中没有工作表');
  }
  
  // 将所有行转为文本
  const lines: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    const cellValues: string[] = [];
    row.eachCell((cell, colNumber) => {
      const val = cell.value;
      if (val !== null && val !== undefined) {
        cellValues.push(String(val));
      }
    });
    if (cellValues.length > 0) {
      lines.push(cellValues.join(' | '));
    }
  });
  
  if (lines.length === 0) {
    throw new Error('Excel 文件内容为空');
  }
  
  // 合并为文本后使用通用解析器
  const text = lines.join('\n');
  return parseSurveyText(text);
}
