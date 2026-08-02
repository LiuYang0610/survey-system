import React, { useMemo, useState } from "react";

interface Question {
  id: string;
  sort_order: number;
  type: string;
  title: string;
  required: number;
  options: string[];
  skip_logic?: any[];
  show_logic?: any[];
}

type Severity = "error" | "warning" | "info";
type Category = "circular" | "unreachable" | "overlapping" | "empty_condition" | "missing_target" | "no_options" | "empty_title";

interface ValidationIssue {
  id: string;
  severity: Severity;
  category: Category;
  questionId?: string;
  questionSortOrder?: number;
  message: string;
  suggestion: string;
}

interface LogicValidatorProps {
  questions: Question[];
  onQuestionClick?: (id: string) => void;
}

const SEVERITY_CONFIG: Record<Severity, { icon: string; label: string; bg: string; border: string; text: string }> = {
  error: { icon: "?", label: "错误", bg: "#fef2f2", border: "#fecaca", text: "#dc2626" },
  warning: { icon: "??", label: "警告", bg: "#fefce8", border: "#fef08a", text: "#ca8a04" },
  info: { icon: "??", label: "提示", bg: "#f0f9ff", border: "#bfdbfe", text: "#2563eb" },
};

const CATEGORY_LABELS: Record<Category, string> = {
  circular: "循环逻辑",
  unreachable: "不可达题目",
  overlapping: "条件重叠",
  empty_condition: "空条件",
  missing_target: "缺失目标",
  no_options: "缺少选项",
  empty_title: "空标题",
};

export default function LogicValidator({ questions, onQuestionClick }: LogicValidatorProps) {
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");

  const issues = useMemo(() => {
    const result: ValidationIssue[] = [];
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // 1. Circular logic
    questions.forEach((q) => {
      q.skip_logic?.forEach((logic: any) => {
        if (logic.target_question_id && logic.action !== "end") {
          const target = questionMap.get(logic.target_question_id);
          if (target) {
            const hasCircular = target.skip_logic?.some((l: any) => l.target_question_id === q.id);
            if (hasCircular) {
              result.push({
                id: "circular-" + q.id + "-" + logic.target_question_id,
                severity: "error",
                category: "circular",
                questionId: q.id,
                questionSortOrder: q.sort_order,
                message: `题目 Q${q.sort_order} 与 Q${target.sort_order} 存在互斥跳转，可能导致无限循环`,
                suggestion: "移除其中一个跳转规则，或改为条件跳转至不同目标题目",
              });
            }
          }
        }
      });
    });

    // 2. Unreachable questions
    const reachable = new Set<string>();
    if (questions.length > 0) reachable.add(questions[0].id);
    questions.forEach((q) => {
      const idx = questions.findIndex((qq) => qq.id === q.id);
      if (idx < questions.length - 1) reachable.add(questions[idx + 1].id);
      q.skip_logic?.forEach((logic: any) => {
        if (logic.target_question_id && logic.action !== "end") reachable.add(logic.target_question_id);
      });
    });
    questions.forEach((q) => {
      if (!reachable.has(q.id)) {
        result.push({
          id: "unreachable-" + q.id,
          severity: "warning",
          category: "unreachable",
          questionId: q.id,
          questionSortOrder: q.sort_order,
          message: `题目 Q${q.sort_order}「${q.title || "未命名"}」可能无法被访问到`,
          suggestion: "检查跳转逻辑，确保此题目可以从前面的题目到达",
        });
      }
    });

    // 3. Overlapping conditions
    questions.forEach((q) => {
      if (q.skip_logic && q.skip_logic.length > 1) {
        const values = q.skip_logic.map((l: any) => l.condition_value).filter(Boolean);
        const dupes = values.filter((v: string, i: number) => values.indexOf(v) !== i);
        if (dupes.length > 0) {
          result.push({
            id: "overlap-" + q.id,
            severity: "warning",
            category: "overlapping",
            questionId: q.id,
            questionSortOrder: q.sort_order,
            message: `题目 Q${q.sort_order} 存在重复条件值「${dupes[0]}」，多条跳转规则将冲突`,
            suggestion: "合并或调整条件值，确保每个选项只对应一条跳转规则",
          });
        }
      }
    });

    // 4. Empty conditions
    questions.forEach((q) => {
      q.skip_logic?.forEach((logic: any, idx: number) => {
        if (!logic.condition_value || logic.condition_value.trim() === "") {
          result.push({
            id: "empty-cond-" + q.id + "-" + idx,
            severity: "error",
            category: "empty_condition",
            questionId: q.id,
            questionSortOrder: q.sort_order,
            message: `题目 Q${q.sort_order} 的第 ${idx + 1} 条跳转规则条件值为空`,
            suggestion: "为跳转规则设置具体的条件选项值",
          });
        }
      });
      q.show_logic?.forEach((logic: any, idx: number) => {
        if (!logic.condition_value || logic.condition_value.trim() === "") {
          result.push({
            id: "empty-show-cond-" + q.id + "-" + idx,
            severity: "error",
            category: "empty_condition",
            questionId: q.id,
            questionSortOrder: q.sort_order,
            message: `题目 Q${q.sort_order} 的第 ${idx + 1} 条显示规则条件值为空`,
            suggestion: "为显示规则设置具体的触发条件",
          });
        }
      });
    });

    // 5. Missing targets
    questions.forEach((q) => {
      q.skip_logic?.forEach((logic: any, idx: number) => {
        if (logic.action !== "end" && (!logic.target_question_id || logic.target_question_id.trim() === "")) {
          result.push({
            id: "no-target-" + q.id + "-" + idx,
            severity: "error",
            category: "missing_target",
            questionId: q.id,
            questionSortOrder: q.sort_order,
            message: `题目 Q${q.sort_order} 的第 ${idx + 1} 条跳转规则未设置目标题目`,
            suggestion: "选择一个目标题目或设置为「结束问卷」",
          });
        }
        if (logic.action !== "end" && logic.target_question_id && !questionMap.has(logic.target_question_id)) {
          result.push({
            id: "invalid-target-" + q.id + "-" + idx,
            severity: "error",
            category: "missing_target",
            questionId: q.id,
            questionSortOrder: q.sort_order,
            message: `题目 Q${q.sort_order} 的跳转目标已被删除`,
            suggestion: "更新跳转规则，选择一个有效的目标题目",
          });
        }
      });
    });

    // 6. No options for choice types
    questions.forEach((q) => {
      if ((q.type === "single" || q.type === "multiple") && (!q.options || q.options.length === 0)) {
        result.push({
          id: "no-opts-" + q.id,
          severity: "error",
          category: "no_options",
          questionId: q.id,
          questionSortOrder: q.sort_order,
          message: `题目 Q${q.sort_order} 是${q.type === "single" ? "单选" : "多选"}题但没有选项`,
          suggestion: "至少添加一个选项",
        });
      }
    });

    // 7. Empty titles
    questions.forEach((q) => {
      if (!q.title || q.title.trim() === "") {
        result.push({
          id: "empty-title-" + q.id,
          severity: "error",
          category: "empty_title",
          questionId: q.id,
          questionSortOrder: q.sort_order,
          message: `题目 Q${q.sort_order} 标题为空`,
          suggestion: "输入题目标题",
        });
      }
    });

    // Sort: error > warning > info, then by sort_order
    const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
    result.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (a.questionSortOrder || 0) - (b.questionSortOrder || 0));

    return result;
  }, [questions]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const filteredIssues = filterSeverity === "all" ? issues : issues.filter((i) => i.severity === filterSeverity);

  const handleClickIssue = (issue: ValidationIssue) => {
    if (issue.questionId) onQuestionClick?.(issue.questionId);
  };

  return (
    <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#1f2937" }}>? 逻辑校验结果</h3>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, padding: "16px 20px" }}>
        {[
          { severity: "error" as Severity, count: errorCount, icon: "?", label: "错误", bg: errorCount > 0 ? "#fef2f2" : "#f9fafb", color: errorCount > 0 ? "#dc2626" : "#9ca3af" },
          { severity: "warning" as Severity, count: warningCount, icon: "??", label: "警告", bg: warningCount > 0 ? "#fefce8" : "#f9fafb", color: warningCount > 0 ? "#ca8a04" : "#9ca3af" },
          { severity: "info" as Severity, count: infoCount, icon: "??", label: "提示", bg: "#f0f9ff", color: "#2563eb" },
        ].map((card) => (
          <button
            key={card.severity}
            onClick={() => setFilterSeverity(filterSeverity === card.severity ? "all" : card.severity)}
            style={{
              flex: 1,
              padding: "14px 16px",
              borderRadius: 10,
              border: filterSeverity === card.severity ? `2px solid ${card.color}` : "1px solid #e5e7eb",
              background: card.bg,
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>{card.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.count}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{card.label}</div>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      {filterSeverity !== "all" && (
        <div style={{ padding: "0 20px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>筛选：</span>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              background: SEVERITY_CONFIG[filterSeverity].bg,
              color: SEVERITY_CONFIG[filterSeverity].text,
              border: `1px solid ${SEVERITY_CONFIG[filterSeverity].border}`,
            }}
          >
            {SEVERITY_CONFIG[filterSeverity].icon} {SEVERITY_CONFIG[filterSeverity].label}
          </span>
          <button
            onClick={() => setFilterSeverity("all")}
            style={{ border: "none", background: "transparent", color: "#6b7280", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
          >
            清除筛选
          </button>
        </div>
      )}

      {/* Issues list */}
      <div style={{ padding: "0 20px 20px" }}>
        {filteredIssues.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              background: "#f0fdf4",
              borderRadius: 10,
              border: "1px solid #bbf7d0",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>??</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#16a34a" }}>
              {issues.length === 0 ? "逻辑校验全部通过，未发现问题" : "当前筛选条件下无问题"}
            </div>
            {issues.length === 0 && (
              <div style={{ fontSize: 13, color: "#4ade80", marginTop: 4 }}>所有逻辑规则均正常</div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredIssues.map((issue) => {
              const cfg = SEVERITY_CONFIG[issue.severity];
              return (
                <div
                  key={issue.id}
                  onClick={() => handleClickIssue(issue)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${cfg.border}`,
                    background: cfg.bg,
                    cursor: issue.questionId ? "pointer" : "default",
                    transition: "box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (issue.questionId) (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)");
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 16, lineHeight: "20px", flexShrink: 0 }}>{cfg.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        {issue.questionSortOrder != null && (
                          <span
                            style={{
                              padding: "1px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background: "#e0e7ff",
                              color: "#4f46e5",
                            }}
                          >
                            Q{issue.questionSortOrder}
                          </span>
                        )}
                        <span
                          style={{
                            padding: "1px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            background: "#f3f4f6",
                            color: "#6b7280",
                          }}
                        >
                          {CATEGORY_LABELS[issue.category]}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "#1f2937", fontWeight: 500, lineHeight: 1.5 }}>{issue.message}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>
                        ?? 建议：{issue.suggestion}
                      </div>
                    </div>
                    {issue.questionId && (
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>点击定位 →</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}