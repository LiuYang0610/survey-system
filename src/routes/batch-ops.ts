import { Hono } from "hono";
import { generateId } from "../lib/uuid";
import { authMiddleware } from "../middleware/auth";
import { kvGet, kvPut, saveOperationLog, KVKeys } from "../lib/store";
import type { Env, Survey, Question, BatchOperationRequest } from "../types";

const batchOps = new Hono<{ Bindings: Env }>();
batchOps.use("*", authMiddleware());

// Execute batch operations on questions
batchOps.post("/surveys/:id/batch", async (c) => {
  const surveyId = c.req.param("id");
  const body = await c.req.json<BatchOperationRequest>();
  
  // Get survey
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(surveyId));
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  
  // Store before state for logging
  const beforeState = JSON.parse(JSON.stringify(survey.questions));
  
  // Validate question IDs exist
  const questionIds = body.question_ids || [];
  const existingIds = survey.questions.map(q => q.id);
  const invalidIds = questionIds.filter(id => !existingIds.includes(id));
  if (invalidIds.length > 0) {
    return c.json({ error: `题目ID不存在: ${invalidIds.join(", ")}` }, 400);
  }
  
  // Execute operation
  let result: any = {};
  let actionDescription = "";
  
  switch (body.operation) {
    case "delete":
      result = await handleDelete(survey, questionIds);
      actionDescription = `批量删除 ${questionIds.length} 道题目`;
      break;
      
    case "copy":
      result = await handleCopy(survey, questionIds);
      actionDescription = `批量复制 ${questionIds.length} 道题目`;
      break;
      
    case "move":
      if (body.target_index === undefined) {
        return c.json({ error: "移动操作需要指定目标位置" }, 400);
      }
      result = await handleMove(survey, questionIds, body.target_index);
      actionDescription = `移动 ${questionIds.length} 道题目到位置 ${body.target_index}`;
      break;
      
    case "set_required":
      result = await handleSetRequired(survey, questionIds, true);
      actionDescription = `设置 ${questionIds.length} 道题目为必填`;
      break;
      
    case "set_optional":
      result = await handleSetRequired(survey, questionIds, false);
      actionDescription = `设置 ${questionIds.length} 道题目为非必填`;
      break;
      
    case "set_visible":
      result = await handleSetVisible(survey, questionIds, true);
      actionDescription = `显示 ${questionIds.length} 道题目`;
      break;
      
    case "set_hidden":
      result = await handleSetVisible(survey, questionIds, false);
      actionDescription = `隐藏 ${questionIds.length} 道题目`;
      break;
      
    case "convert_type":
      if (!body.new_type) {
        return c.json({ error: "转换题型需要指定新题型" }, 400);
      }
      result = await handleConvertType(survey, questionIds, body.new_type);
      actionDescription = `转换 ${questionIds.length} 道题目的题型为 ${body.new_type}`;
      break;
      
    default:
      return c.json({ error: "不支持的操作类型" }, 400);
  }
  
  if (result.error) {
    return c.json({ error: result.error }, 400);
  }
  
  // Update survey
  survey.questions = result.questions;
  survey.updated_at = new Date().toISOString();
  await kvPut(c.env.KV, KVKeys.survey(surveyId), survey);
  
  // Log operation
  await saveOperationLog(c.env.KV, surveyId, {
    id: generateId(),
    survey_id: surveyId,
    action: "batch_edit",
    operator: c.get("admin").username,
    details: {
      operation: body.operation,
      question_ids: questionIds,
      new_type: body.new_type,
      target_index: body.target_index,
      description: actionDescription
    },
    before_state: beforeState,
    after_state: survey.questions,
    timestamp: new Date().toISOString()
  });
  
  return c.json({
    message: actionDescription + "成功",
    questions: survey.questions,
    warnings: result.warnings || []
  });
});

// Helper functions for batch operations
async function handleDelete(survey: Survey, questionIds: string[]): Promise<any> {
  const questions = survey.questions.filter(q => !questionIds.includes(q.id));
  // Reorder remaining questions
  questions.forEach((q, idx) => q.sort_order = idx + 1);
  return { questions };
}

async function handleCopy(survey: Survey, questionIds: string[]): Promise<any> {
  const questions = [...survey.questions];
  const copiedQuestions: Question[] = [];
  
  for (const id of questionIds) {
    const original = questions.find(q => q.id === id);
    if (original) {
      const copy: Question = {
        ...JSON.parse(JSON.stringify(original)),
        id: generateId(),
        sort_order: questions.length + copiedQuestions.length + 1
      };
      copiedQuestions.push(copy);
    }
  }
  
  return { questions: [...questions, ...copiedQuestions] };
}

async function handleMove(survey: Survey, questionIds: string[], targetIndex: number): Promise<any> {
  const questions = [...survey.questions];
  const questionsToMove: Question[] = [];
  
  // Extract questions to move
  for (const id of questionIds) {
    const idx = questions.findIndex(q => q.id === id);
    if (idx !== -1) {
      questionsToMove.push(questions.splice(idx, 1)[0]);
    }
  }
  
  // Insert at target position
  const insertIndex = Math.min(targetIndex, questions.length);
  questions.splice(insertIndex, 0, ...questionsToMove);
  
  // Reorder
  questions.forEach((q, idx) => q.sort_order = idx + 1);
  
  return { questions };
}

async function handleSetRequired(survey: Survey, questionIds: string[], required: boolean): Promise<any> {
  const questions = survey.questions.map(q => {
    if (questionIds.includes(q.id)) {
      return { ...q, required: required ? 1 : 0 };
    }
    return q;
  });
  return { questions };
}

async function handleSetVisible(survey: Survey, questionIds: string[], visible: boolean): Promise<any> {
  const questions = survey.questions.map(q => {
    if (questionIds.includes(q.id)) {
      return { ...q, visible: visible ? 1 : 0 };
    }
    return q;
  });
  return { questions };
}

async function handleConvertType(survey: Survey, questionIds: string[], newType: Question['type']): Promise<any> {
  const questions = [...survey.questions];
  const warnings: string[] = [];
  
  for (const id of questionIds) {
    const idx = questions.findIndex(q => q.id === id);
    if (idx === -1) continue;
    
    const question = questions[idx];
    const oldType = question.type;
    
    // Check compatibility
    const compatibility = checkTypeCompatibility(oldType, newType);
    
    if (!compatibility.compatible) {
      warnings.push(`题目 "${question.title}" 无法从 ${oldType} 转换为 ${newType}: ${compatibility.reason}`);
      continue;
    }
    
    // Apply conversion
    questions[idx] = convertQuestion(question, newType, compatibility);
    
    if (compatibility.warning) {
      warnings.push(`题目 "${question.title}": ${compatibility.warning}`);
    }
  }
  
  return { questions, warnings };
}

function checkTypeCompatibility(oldType: string, newType: string): { compatible: boolean; reason?: string; warning?: string } {
  // Compatible conversions
  const compatiblePairs: Record<string, string[]> = {
    'single': ['multiple', 'scale'],
    'multiple': ['single'],
    'text': ['single', 'multiple'],
    'scale': ['single']
  };
  
  if (oldType === newType) {
    return { compatible: true, warning: "题型相同，无需转换" };
  }
  
  if (!compatiblePairs[oldType]?.includes(newType)) {
    return { 
      compatible: false, 
      reason: `${oldType} 与 ${newType} 不兼容` 
    };
  }
  
  // Special warnings
  if (oldType === 'multiple' && newType === 'single') {
    return { 
      compatible: true, 
      warning: "多选转单选时，如果已有多个选项被选中，需要用户重新选择" 
    };
  }
  
  if (oldType === 'text' && (newType === 'single' || newType === 'multiple')) {
    return { 
      compatible: true, 
      warning: "文本题转选择题时，需要手动添加选项" 
    };
  }
  
  return { compatible: true };
}

function convertQuestion(question: Question, newType: Question['type'], compatibility: any): Question {
  const converted = { ...question, type: newType };
  
  // Preserve options for compatible types
  if (['single', 'multiple'].includes(newType) && !question.options.length) {
    converted.options = ["选项1", "选项2", "选项3"];
  }
  
  // Set default scale values if converting to scale
  if (newType === 'scale') {
    converted.scale_min = 1;
    converted.scale_max = 5;
    converted.scale_min_label = "非常不满意";
    converted.scale_max_label = "非常满意";
  }
  
  // Clear scale values if converting from scale
  if (question.type === 'scale' && newType !== 'scale') {
    converted.scale_min = 1;
    converted.scale_max = 5;
    converted.scale_min_label = "";
    converted.scale_max_label = "";
  }
  
  return converted;
}

export default batchOps;
