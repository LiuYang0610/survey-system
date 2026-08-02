import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { kvGet, KVKeys } from "../lib/store";
import type { Env, Survey, Question, SkipLogic, ShowLogic } from "../types";

const logicCheck = new Hono<{ Bindings: Env }>();
logicCheck.use("*", authMiddleware());

interface LogicIssue {
  id: string;
  type: 'unreachable' | 'circular' | 'overlapping' | 'empty_condition' | 'missing_target' | 'dead_end';
  severity: 'error' | 'warning' | 'info';
  question_id?: string;
  question_title?: string;
  logic_id?: string;
  description: string;
  suggestion: string;
}

// Run comprehensive logic validation
logicCheck.post("/surveys/:id/validate-logic", async (c) => {
  const surveyId = c.req.param("id");
  
  // Get survey
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(surveyId));
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  
  const issues: LogicIssue[] = [];
  const questions = survey.questions;
  
  // Build question map for quick lookup
  const questionMap = new Map<string, Question>();
  for (const q of questions) {
    questionMap.set(q.id, q);
  }
  
  // Check 1: Unreachable questions
  const reachableQuestions = findReachableQuestions(questions);
  for (const q of questions) {
    if (!reachableQuestions.has(q.id) && q.sort_order > 1) {
      issues.push({
        id: `unreachable-${q.id}`,
        type: 'unreachable',
        severity: 'error',
        question_id: q.id,
        question_title: q.title,
        description: `题目 "${q.title}" 无法通过正常流程到达`,
        suggestion: "检查前置题目的跳转逻辑，确保所有路径都能到达此题目"
      });
    }
  }
  
  // Check 2: Circular logic
  const circularPaths = findCircularLogic(questions);
  for (const path of circularPaths) {
    const pathTitles = path.map(id => questionMap.get(id)?.title || id).join(" → ");
    issues.push({
      id: `circular-${path.join('-')}`,
      type: 'circular',
      severity: 'error',
      description: `存在循环跳转: ${pathTitles}`,
      suggestion: "移除或修改导致循环的跳转逻辑"
    });
  }
  
  // Check 3: Empty conditions
  for (const q of questions) {
    if (q.skip_logic) {
      for (const logic of q.skip_logic) {
        if (!logic.condition_value || logic.condition_value.trim() === '') {
          issues.push({
            id: `empty-${logic.id}`,
            type: 'empty_condition',
            severity: 'warning',
            question_id: q.id,
            question_title: q.title,
            logic_id: logic.id,
            description: `题目 "${q.title}" 的跳转逻辑条件值为空`,
            suggestion: "为跳转逻辑设置有效的条件值"
          });
        }
      }
    }
    
    if (q.show_logic) {
      for (const logic of q.show_logic) {
        if (!logic.condition_value || logic.condition_value.trim() === '') {
          issues.push({
            id: `empty-show-${logic.id}`,
            type: 'empty_condition',
            severity: 'warning',
            question_id: q.id,
            question_title: q.title,
            logic_id: logic.id,
            description: `题目 "${q.title}" 的显隐逻辑条件值为空`,
            suggestion: "为显隐逻辑设置有效的条件值"
          });
        }
      }
    }
  }
  
  // Check 4: Missing targets
  for (const q of questions) {
    if (q.skip_logic) {
      for (const logic of q.skip_logic) {
        if (logic.action === 'skip_to' && !questionMap.has(logic.target_question_id)) {
          issues.push({
            id: `missing-target-${logic.id}`,
            type: 'missing_target',
            severity: 'error',
            question_id: q.id,
            question_title: q.title,
            logic_id: logic.id,
            description: `题目 "${q.title}" 的跳转目标题目不存在`,
            suggestion: "更新跳转逻辑指向有效的题目"
          });
        }
      }
    }
    
    if (q.show_logic) {
      for (const logic of q.show_logic) {
        if (!questionMap.has(logic.target_question_id)) {
          issues.push({
            id: `missing-show-target-${logic.id}`,
            type: 'missing_target',
            severity: 'error',
            question_id: q.id,
            question_title: q.title,
            logic_id: logic.id,
            description: `题目 "${q.title}" 的显隐目标题目不存在`,
            suggestion: "更新显隐逻辑指向有效的题目"
          });
        }
      }
    }
  }
  
  // Check 5: Overlapping conditions
  for (const q of questions) {
    if (q.skip_logic && q.skip_logic.length > 1) {
      const overlapping = findOverlappingConditions(q.skip_logic);
      for (const overlap of overlapping) {
        issues.push({
          id: `overlapping-${q.id}-${overlap[0].id}-${overlap[1].id}`,
          type: 'overlapping',
          severity: 'warning',
          question_id: q.id,
          question_title: q.title,
          description: `题目 "${q.title}" 存在重叠的跳转条件`,
          suggestion: "确保跳转条件互斥，避免逻辑混乱"
        });
      }
    }
  }
  
  // Check 6: Dead ends (questions with skip_to end but not at the end)
  for (const q of questions) {
    if (q.skip_logic) {
      const hasEndAction = q.skip_logic.some(l => l.action === 'end');
      if (hasEndAction && q.sort_order < questions.length) {
        issues.push({
          id: `deadend-${q.id}`,
          type: 'dead_end',
          severity: 'info',
          question_id: q.id,
          question_title: q.title,
          description: `题目 "${q.title}" 在非末尾位置设置了结束问卷逻辑`,
          suggestion: "确认是否需要在中间结束问卷"
        });
      }
    }
  }
  
  // Summary
  const summary = {
    total_issues: issues.length,
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
    by_type: {
      unreachable: issues.filter(i => i.type === 'unreachable').length,
      circular: issues.filter(i => i.type === 'circular').length,
      overlapping: issues.filter(i => i.type === 'overlapping').length,
      empty_condition: issues.filter(i => i.type === 'empty_condition').length,
      missing_target: issues.filter(i => i.type === 'missing_target').length,
      dead_end: issues.filter(i => i.type === 'dead_end').length
    }
  };
  
  return c.json({
    valid: summary.errors === 0,
    summary,
    issues
  });
});

// Helper function to find reachable questions
function findReachableQuestions(questions: Question[]): Set<string> {
  const reachable = new Set<string>();
  
  // First question is always reachable
  if (questions.length > 0) {
    reachable.add(questions[0].id);
  }
  
  // Build adjacency list from skip logic
  const adjacency = new Map<string, string[]>();
  for (const q of questions) {
    adjacency.set(q.id, []);
    
    // Default flow: next question
    const nextIndex = q.sort_order;
    if (nextIndex < questions.length) {
      adjacency.get(q.id)!.push(questions[nextIndex].id);
    }
    
    // Skip logic
    if (q.skip_logic) {
      for (const logic of q.skip_logic) {
        if (logic.action === 'skip_to') {
          adjacency.get(q.id)!.push(logic.target_question_id);
        }
      }
    }
  }
  
  // BFS to find all reachable questions
  const queue = [questions[0]?.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current || reachable.has(current)) continue;
    
    reachable.add(current);
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!reachable.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }
  
  return reachable;
}

// Helper function to find circular logic
function findCircularLogic(questions: Question[]): string[][] {
  const cycles: string[][] = [];
  const adjacency = new Map<string, string[]>();
  
  // Build adjacency list
  for (const q of questions) {
    adjacency.set(q.id, []);
    if (q.skip_logic) {
      for (const logic of q.skip_logic) {
        if (logic.action === 'skip_to') {
          adjacency.get(q.id)!.push(logic.target_question_id);
        }
      }
    }
  }
  
  // DFS to find cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];
  
  function dfs(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        // Found cycle
        const cycleStart = path.indexOf(neighbor);
        cycles.push(path.slice(cycleStart));
        return true;
      }
    }
    
    path.pop();
    recursionStack.delete(node);
    return false;
  }
  
  for (const q of questions) {
    if (!visited.has(q.id)) {
      dfs(q.id);
    }
  }
  
  return cycles;
}

// Helper function to find overlapping conditions
function findOverlappingConditions(logics: SkipLogic[]): [SkipLogic, SkipLogic][] {
  const overlaps: [SkipLogic, SkipLogic][] = [];
  
  for (let i = 0; i < logics.length; i++) {
    for (let j = i + 1; j < logics.length; j++) {
      const l1 = logics[i];
      const l2 = logics[j];
      
      // Check if conditions could overlap
      if (l1.condition === l2.condition && l1.condition_value === l2.condition_value) {
        overlaps.push([l1, l2]);
      }
      
      // Check for contradictory conditions on same value
      if (l1.condition === 'equals' && l2.condition === 'not_equals' && 
          l1.condition_value === l2.condition_value) {
        // This is actually valid (equals vs not_equals), not an overlap
      }
    }
  }
  
  return overlaps;
}

export default logicCheck;
