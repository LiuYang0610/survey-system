import { Hono } from "hono";
import { generateId } from "../lib/uuid";
import { authMiddleware } from "../middleware/auth";
import { kvGet, kvPut, saveOperationLog, saveSnapshot, getSnapshots, getSnapshot, getOperationLogs, KVKeys } from "../lib/store";
import type { Env, Survey, OperationLog, VersionSnapshot } from "../types";

const versionRoutes = new Hono<{ Bindings: Env }>();
versionRoutes.use("*", authMiddleware());

// Create version snapshot with enhanced features
versionRoutes.post("/snapshot/:surveyId", async (c) => {
  const surveyId = c.req.param("surveyId");
  const { name, description } = await c.req.json<{ name?: string; description?: string }>();
  
  const survey = await kvGet<Survey>(c.env.KV, KVKeys.survey(surveyId));
  if (!survey) return c.json({ error: "问卷不存在" }, 404);
  
  // Get previous snapshot for comparison
  const snapshots = await getSnapshots(c.env.KV, surveyId);
  const previousSnapshot = snapshots.length > 0 ? snapshots[0] : null;
  
  // Generate change summary
  const changeSummary = generateChangeSummary(previousSnapshot?.data || null, survey);
  
  const snapshotId = generateId();
  const snapshot: VersionSnapshot = {
    id: snapshotId,
    survey_id: surveyId,
    name: name || "版本 " + new Date().toLocaleString("zh-CN"),
    data: JSON.parse(JSON.stringify(survey)),
    created_by: c.get("admin").username,
    created_at: new Date().toISOString(),
    description: description || "",
    change_summary: changeSummary
  };
  
  await saveSnapshot(c.env.KV, snapshot);
  
  // Log operation
  await saveOperationLog(c.env.KV, surveyId, {
    id: generateId(),
    survey_id: surveyId,
    action: "create_snapshot",
    operator: c.get("admin").username,
    details: {
      snapshot_id: snapshotId,
      snapshot_name: snapshot.name,
      change_summary: changeSummary
    },
    timestamp: new Date().toISOString()
  });
  
  return c.json({ id: snapshotId, message: "快照创建成功", change_summary: changeSummary });
});

// Get snapshot list with enhanced info
versionRoutes.get("/snapshots/:surveyId", async (c) => {
  const surveyId = c.req.param("surveyId");
  const snapshots = await getSnapshots(c.env.KV, surveyId);
  
  // Return summary info only
  const snapshotList = snapshots.map(s => ({
    id: s.id,
    name: s.name,
    created_by: s.created_by,
    created_at: s.created_at,
    description: s.description,
    change_summary: s.change_summary,
    question_count: s.data.questions.length
  }));
  
  return c.json({ snapshots: snapshotList });
});

// Get snapshot details
versionRoutes.get("/snapshot/:snapshotId", async (c) => {
  const snapshotId = c.req.param("snapshotId");
  const snapshot = await getSnapshot(c.env.KV, snapshotId);
  if (!snapshot) return c.json({ error: "快照不存在" }, 404);
  return c.json(snapshot);
});

// Rollback to snapshot with enhanced logging
versionRoutes.post("/rollback/:snapshotId", async (c) => {
  const snapshotId = c.req.param("snapshotId");
  const snapshot = await getSnapshot(c.env.KV, snapshotId);
  if (!snapshot) return c.json({ error: "快照不存在" }, 404);
  
  // Get current state for logging
  const currentSurvey = await kvGet<Survey>(c.env.KV, KVKeys.survey(snapshot.survey_id));
  const beforeState = currentSurvey ? JSON.parse(JSON.stringify(currentSurvey)) : null;
  
  // Restore survey data
  const restoredSurvey = JSON.parse(JSON.stringify(snapshot.data));
  restoredSurvey.updated_at = new Date().toISOString();
  await kvPut(c.env.KV, KVKeys.survey(snapshot.survey_id), restoredSurvey);
  
  // Log operation with before/after states
  await saveOperationLog(c.env.KV, snapshot.survey_id, {
    id: generateId(),
    survey_id: snapshot.survey_id,
    action: "rollback",
    operator: c.get("admin").username,
    details: {
      snapshot_id: snapshotId,
      snapshot_name: snapshot.name,
      snapshot_created_at: snapshot.created_at
    },
    before_state: beforeState,
    after_state: restoredSurvey,
    timestamp: new Date().toISOString()
  });
  
  return c.json({ message: "回滚成功", survey: restoredSurvey });
});

// Get operation logs with enhanced filtering
versionRoutes.get("/logs/:surveyId", async (c) => {
  const surveyId = c.req.param("surveyId");
  const limit = parseInt(c.req.query("limit") || "50");
  const action = c.req.query("action"); // Optional filter by action type
  
  let logs = await getOperationLogs(c.env.KV, surveyId, limit * 2); // Get more to filter
  
  if (action) {
    logs = logs.filter(log => log.action === action);
  }
  
  return c.json({ logs: logs.slice(0, limit) });
});

// Diff comparison between two snapshots
versionRoutes.get("/diff/:snapshotId1/:snapshotId2", async (c) => {
  const snapshotId1 = c.req.param("snapshotId1");
  const snapshotId2 = c.req.param("snapshotId2");
  
  const snapshot1 = await getSnapshot(c.env.KV, snapshotId1);
  const snapshot2 = await getSnapshot(c.env.KV, snapshotId2);
  
  if (!snapshot1 || !snapshot2) {
    return c.json({ error: "快照不存在" }, 404);
  }
  
  const diff = compareSnapshots(snapshot1.data, snapshot2.data);
  
  return c.json({
    snapshot1: { id: snapshot1.id, name: snapshot1.name, created_at: snapshot1.created_at },
    snapshot2: { id: snapshot2.id, name: snapshot2.name, created_at: snapshot2.created_at },
    diff
  });
});

// Helper function to generate change summary
function generateChangeSummary(previous: Survey | null, current: Survey): string {
  if (!previous) {
    return `初始版本，包含 ${current.questions.length} 道题目`;
  }
  
  const changes: string[] = [];
  
  // Check title change
  if (previous.title !== current.title) {
    changes.push(`标题从 "${previous.title}" 修改为 "${current.title}"`);
  }
  
  // Check question count change
  const prevCount = previous.questions.length;
  const currCount = current.questions.length;
  if (prevCount !== currCount) {
    if (currCount > prevCount) {
      changes.push(`新增 ${currCount - prevCount} 道题目`);
    } else {
      changes.push(`删除 ${prevCount - currCount} 道题目`);
    }
  }
  
  // Check for question type changes
  for (const currQ of current.questions) {
    const prevQ = previous.questions.find(q => q.id === currQ.id);
    if (prevQ && prevQ.type !== currQ.type) {
      changes.push(`题目 "${currQ.title}" 类型从 ${prevQ.type} 改为 ${currQ.type}`);
    }
  }
  
  // Check for required status changes
  for (const currQ of current.questions) {
    const prevQ = previous.questions.find(q => q.id === currQ.id);
    if (prevQ && prevQ.required !== currQ.required) {
      changes.push(`题目 "${currQ.title}" ${currQ.required ? "设为必填" : "设为选填"}`);
    }
  }
  
  if (changes.length === 0) {
    return "无显著变更";
  }
  
  return changes.join("；");
}

// Helper function to compare two snapshots
function compareSnapshots(s1: Survey, s2: Survey): any {
  const diff: any = {
    title_changed: s1.title !== s2.title,
    description_changed: s1.description !== s2.description,
    questions_added: [],
    questions_removed: [],
    questions_modified: []
  };
  
  // Find added questions
  for (const q2 of s2.questions) {
    if (!s1.questions.find(q1 => q1.id === q2.id)) {
      diff.questions_added.push(q2);
    }
  }
  
  // Find removed questions
  for (const q1 of s1.questions) {
    if (!s2.questions.find(q2 => q2.id === q1.id)) {
      diff.questions_removed.push(q1);
    }
  }
  
  // Find modified questions
  for (const q2 of s2.questions) {
    const q1 = s1.questions.find(q => q.id === q2.id);
    if (q1) {
      const changes: string[] = [];
      if (q1.title !== q2.title) changes.push("标题");
      if (q1.type !== q2.type) changes.push("题型");
      if (q1.required !== q2.required) changes.push("必填状态");
      if (JSON.stringify(q1.options) !== JSON.stringify(q2.options)) changes.push("选项");
      if (q1.visible !== q2.visible) changes.push("显隐状态");
      
      if (changes.length > 0) {
        diff.questions_modified.push({
          id: q2.id,
          title: q2.title,
          changes
        });
      }
    }
  }
  
  return diff;
}

// Log operation helper (for backward compatibility)
async function logOperation(kv: KVNamespace, surveyId: string, action: string, operator: string, details: any) {
  await saveOperationLog(kv, surveyId, {
    id: generateId(),
    survey_id: surveyId,
    action,
    operator,
    details,
    timestamp: new Date().toISOString()
  });
}

export default versionRoutes;
