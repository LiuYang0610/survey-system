import React, { useState, useEffect } from "react";
import { deepDecodeUnicode } from "../../lib/utils";
import { useParams, useNavigate } from "react-router-dom";
import {
  getSurveyDetail, createSurvey, updateSurvey, updateQuestions
} from "../../lib/api";

interface Question {
  id?: string;
  sort_order: number;
  type: "single" | "multiple" | "text" | "scale";
  title: string;
  description: string;
  required: boolean;
  options: string[];
  scale_min: number;
  scale_max: number;
  scale_min_label: string;
  scale_max_label: string;
  skip_logic?: {
    enabled: boolean;
    conditions: SkipCondition[];
  };
}

interface SkipCondition {
  id: string;
  trigger: "option_selected" | "option_not_selected" | "text_not_empty" | "text_empty" | "scale_gte" | "scale_lte";
  option_index?: number;
  scale_value?: number;
  action: "skip_to" | "end";
  target_question_index?: number;
}

const TYPE_NAMES: Record<string, string> = { 
  single: "单选", 
  multiple: "多选", 
  text: "填空", 
  scale: "量表" 
};

const TYPE_COLORS: Record<string, string> = { 
  single: "#4f46e5", 
  multiple: "#7c3aed", 
  text: "#059669", 
  scale: "#d97706" 
};

const TRIGGER_NAMES: Record<string, string> = {
  option_selected: "选择",
  option_not_selected: "未选择",
  text_not_empty: "填写了",
  text_empty: "未填写",
  scale_gte: "评分 ≥",
  scale_lte: "评分 ≤",
};

export default function SurveyEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [editingLogic, setEditingLogic] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const rawData = await getSurveyDetail(id!);
        const data = deepDecodeUnicode(rawData);
        setTitle(data.title);
        setDescription(data.description || "");
        setQuestions(
          data.questions.map((q: any) => ({
            ...q,
            required: q.required === 1,
            options: Array.isArray(q.options) ? q.options : [],
            skip_logic: q.skip_logic || { enabled: false, conditions: [] },
          }))
        );
      } catch (err: any) {
        alert(err.message || "加载失败");
        navigate("/admin");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate]);

  const addQuestion = (type: Question["type"]) => {
    const newQ: Question = {
      sort_order: questions.length + 1,
      type,
      title: "",
      description: "",
      required: false,
      options: type === "single" || type === "multiple" ? ["选项1", "选项2"] : [],
      scale_min: 1,
      scale_max: 5,
      scale_min_label: "非常不满意",
      scale_max_label: "非常满意",
      skip_logic: { enabled: false, conditions: [] },
    };
    setQuestions([...questions, newQ]);
  };

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setQuestions(newQuestions);
  };

  const switchQuestionType = (index: number, newType: Question["type"]) => {
    const q = questions[index];
    if (q.type === newType) return;
    
    let newOptions = [...q.options];
    if (newType === "single" || newType === "multiple") {
      if (newOptions.length === 0) newOptions = ["选项1", "选项2"];
    } else {
      newOptions = [];
    }
    
    updateQuestion(index, { type: newType, options: newOptions });
  };

  const removeQuestion = (index: number) => {
    if (!confirm("确定删除此题目？")) return;
    setQuestions(questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i + 1 })));
    if (editingLogic === index) setEditingLogic(null);
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= questions.length) return;
    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
    setQuestions(newQuestions.map((q, i) => ({ ...q, sort_order: i + 1 })));
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const newQuestions = [...questions];
    const newOptions = [...newQuestions[qIndex].options];
    newOptions[oIndex] = value;
    newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions };
    setQuestions(newQuestions);
  };

  const addOption = (qIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex] = {
      ...newQuestions[qIndex],
      options: [...newQuestions[qIndex].options, `选项${newQuestions[qIndex].options.length + 1}`],
    };
    setQuestions(newQuestions);
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex] = {
      ...newQuestions[qIndex],
      options: newQuestions[qIndex].options.filter((_, i) => i !== oIndex),
    };
    setQuestions(newQuestions);
  };

  // 跳转逻辑
  const toggleSkipLogic = (qIndex: number) => {
    const q = questions[qIndex];
    updateQuestion(qIndex, { 
      skip_logic: { enabled: !q.skip_logic?.enabled, conditions: q.skip_logic?.conditions || [] } 
    });
  };

  const addSkipCondition = (qIndex: number) => {
    const q = questions[qIndex];
    let defaultTrigger: SkipCondition["trigger"] = "option_selected";
    let defaultScaleValue: number | undefined;
    
    if (q.type === "text") {
      defaultTrigger = "text_not_empty";
    } else if (q.type === "scale") {
      defaultTrigger = "scale_gte";
      defaultScaleValue = 3;
    }
    
    const newCondition: SkipCondition = {
      id: Date.now().toString(),
      trigger: defaultTrigger,
      option_index: 0,
      scale_value: defaultScaleValue,
      action: "skip_to",
      target_question_index: qIndex + 2,
    };
    
    updateQuestion(qIndex, {
      skip_logic: {
        enabled: true,
        conditions: [...(q.skip_logic?.conditions || []), newCondition],
      },
    });
  };

  const updateSkipCondition = (qIndex: number, condId: string, updates: Partial<SkipCondition>) => {
    const q = questions[qIndex];
    const newConditions = (q.skip_logic?.conditions || []).map(c => 
      c.id === condId ? { ...c, ...updates } : c
    );
    updateQuestion(qIndex, { skip_logic: { enabled: true, conditions: newConditions } });
  };

  const removeSkipCondition = (qIndex: number, condId: string) => {
    const q = questions[qIndex];
    const newConditions = (q.skip_logic?.conditions || []).filter(c => c.id !== condId);
    updateQuestion(qIndex, { skip_logic: { enabled: newConditions.length > 0, conditions: newConditions } });
  };

  // 获取当前题型可用的触发条件
  const getAvailableTriggers = (type: Question["type"]): SkipCondition["trigger"][] => {
    switch (type) {
      case "single":
        return ["option_selected", "option_not_selected"];
      case "multiple":
        return ["option_selected", "option_not_selected"];
      case "text":
        return ["text_not_empty", "text_empty"];
      case "scale":
        return ["scale_gte", "scale_lte"];
      default:
        return [];
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { alert("请输入问卷标题"); return; }
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].title.trim()) { alert(`第 ${i + 1} 题标题不能为空`); return; }
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateSurvey(id!, { title, description });
        await updateQuestions(id!, questions.map(q => ({ ...q, required: q.required ? 1 : 0 })));
        alert("保存成功");
      } else {
        const data = await createSurvey({ title, description, questions: questions.map(q => ({ ...q, required: q.required ? 1 : 0 })) });
        alert("创建成功");
        navigate(`/admin/survey/${data.id}/edit`);
      }
    } catch (err: any) { alert(err.message || "保存失败"); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}>加载中...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>问卷基本信息</h3>
        <div style={styles.field}>
          <label style={styles.label}>问卷标题 *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="请输入问卷标题" style={styles.input} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>问卷说明（可选）</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="请输入问卷说明" style={styles.textarea} rows={3} />
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={{...styles.sectionTitle, marginBottom: 0}}>题目列表 ({questions.length})</h3>
          <div style={styles.addBtnGroup}>
            <button onClick={() => addQuestion("single")} style={styles.addBtn}>+ 单选</button>
            <button onClick={() => addQuestion("multiple")} style={styles.addBtn}>+ 多选</button>
            <button onClick={() => addQuestion("text")} style={styles.addBtn}>+ 填空</button>
            <button onClick={() => addQuestion("scale")} style={styles.addBtn}>+ 量表</button>
          </div>
        </div>

        {questions.length === 0 ? (
          <div style={styles.emptyQuestions}><p>暂无题目，请点击上方按钮添加</p></div>
        ) : (
          questions.map((q, idx) => (
            <div key={idx} style={styles.questionCard}>
              <div style={styles.questionHeader}>
                <span style={styles.questionNum}>{idx + 1}.</span>
                <select value={q.type} onChange={(e) => switchQuestionType(idx, e.target.value as Question["type"])} style={{...styles.typeSelect, borderColor: TYPE_COLORS[q.type], color: TYPE_COLORS[q.type]}}>
                  <option value="single">单选</option>
                  <option value="multiple">多选</option>
                  <option value="text">填空</option>
                  <option value="scale">量表</option>
                </select>
                <button onClick={() => moveQuestion(idx, -1)} style={styles.moveBtn} disabled={idx === 0}>↑</button>
                <button onClick={() => moveQuestion(idx, 1)} style={styles.moveBtn} disabled={idx === questions.length - 1}>↓</button>
                <button onClick={() => setEditingLogic(editingLogic === idx ? null : idx)} style={{...styles.logicBtn, background: q.skip_logic?.enabled ? "#fef3c7" : "#fff", borderColor: q.skip_logic?.enabled ? "#f59e0b" : "#ddd"}}>🔀 跳转</button>
                <label style={styles.requiredLabel}><input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} />必填</label>
                <button onClick={() => removeQuestion(idx)} style={styles.deleteBtn}>删除</button>
              </div>

              <div style={styles.questionBody}>
                <input type="text" value={q.title} onChange={(e) => updateQuestion(idx, { title: e.target.value })} placeholder="请输入题目标题" style={styles.questionInput} />

                {(q.type === "single" || q.type === "multiple") && (
                  <div style={styles.optionsEditor}>
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} style={styles.optionRow}>
                        <span style={styles.optionIndex}>{String.fromCharCode(65 + oIdx)}.</span>
                        <input type="text" value={opt} onChange={(e) => updateOption(idx, oIdx, e.target.value)} style={styles.optionInput} placeholder={`选项 ${oIdx + 1}`} />
                        <button onClick={() => removeOption(idx, oIdx)} style={styles.removeOptionBtn} disabled={q.options.length <= 1}>×</button>
                      </div>
                    ))}
                    <button onClick={() => addOption(idx)} style={styles.addOptionBtn}>+ 添加选项</button>
                  </div>
                )}

                {q.type === "scale" && (
                  <div style={styles.scaleSettings}>
                    <div style={styles.scaleRow}>
                      <span>范围：</span>
                      <input type="number" value={q.scale_min} onChange={(e) => updateQuestion(idx, { scale_min: parseInt(e.target.value) || 1 })} style={styles.scaleInput} />
                      <span>到</span>
                      <input type="number" value={q.scale_max} onChange={(e) => updateQuestion(idx, { scale_max: parseInt(e.target.value) || 5 })} style={styles.scaleInput} />
                    </div>
                    <div style={styles.scaleRow}>
                      <span>最小值标签：</span>
                      <input type="text" value={q.scale_min_label} onChange={(e) => updateQuestion(idx, { scale_min_label: e.target.value })} style={styles.scaleTextInput} placeholder="如：非常不满意" />
                    </div>
                    <div style={styles.scaleRow}>
                      <span>最大值标签：</span>
                      <input type="text" value={q.scale_max_label} onChange={(e) => updateQuestion(idx, { scale_max_label: e.target.value })} style={styles.scaleTextInput} placeholder="如：非常满意" />
                    </div>
                  </div>
                )}

                {/* 跳转逻辑编辑区 - 所有题型可用 */}
                {editingLogic === idx && (
                  <div style={styles.logicEditor}>
                    <div style={styles.logicHeader}>
                      <span style={styles.logicTitle}>🔀 跳转逻辑设置</span>
                      <label style={styles.logicToggle}>
                        <input type="checkbox" checked={q.skip_logic?.enabled || false} onChange={() => toggleSkipLogic(idx)} />
                        启用跳转
                      </label>
                    </div>
                    
                    {q.skip_logic?.enabled && (
                      <>
                        {(q.skip_logic?.conditions || []).map((cond) => (
                          <div key={cond.id} style={styles.logicCondition}>
                            {/* 触发条件选择 */}
                            <span style={styles.logicLabel}>当</span>
                            <select
                              value={cond.trigger}
                              onChange={(e) => updateSkipCondition(idx, cond.id, { trigger: e.target.value as any })}
                              style={styles.logicSelect}
                            >
                              {getAvailableTriggers(q.type).map(t => (
                                <option key={t} value={t}>{TRIGGER_NAMES[t]}</option>
                              ))}
                            </select>
                            
                            {/* 根据触发类型显示不同输入 */}
                            {(cond.trigger === "option_selected" || cond.trigger === "option_not_selected") && (
                              <select value={cond.option_index || 0} onChange={(e) => updateSkipCondition(idx, cond.id, { option_index: parseInt(e.target.value) })} style={styles.logicSelect}>
                                {q.options.map((opt, oIdx) => (
                                  <option key={oIdx} value={oIdx}>{String.fromCharCode(65 + oIdx)}. {opt}</option>
                                ))}
                              </select>
                            )}
                            
                            {(cond.trigger === "scale_gte" || cond.trigger === "scale_lte") && (
                              <input type="number" value={cond.scale_value || 3} onChange={(e) => updateSkipCondition(idx, cond.id, { scale_value: parseInt(e.target.value) })} style={{...styles.logicSelect, width: 60}} min={q.scale_min} max={q.scale_max} />
                            )}
                            
                            {/* 动作选择 */}
                            <span style={styles.logicLabel}>则</span>
                            <select value={cond.action} onChange={(e) => updateSkipCondition(idx, cond.id, { action: e.target.value as any, target_question_index: e.target.value === "skip_to" ? idx + 2 : undefined })} style={styles.logicSelect}>
                              <option value="skip_to">跳转到</option>
                              <option value="end">结束问卷</option>
                            </select>
                            
                            {cond.action === "skip_to" && (
                              <select value={cond.target_question_index || idx + 2} onChange={(e) => updateSkipCondition(idx, cond.id, { target_question_index: parseInt(e.target.value) })} style={styles.logicSelect}>
                                {questions.map((tq, tIdx) => (
                                  <option key={tIdx} value={tIdx + 1}>第 {tIdx + 1} 题</option>
                                ))}
                              </select>
                            )}
                            
                            <button onClick={() => removeSkipCondition(idx, cond.id)} style={styles.logicRemoveBtn}>×</button>
                          </div>
                        ))}
                        <button onClick={() => addSkipCondition(idx)} style={styles.addLogicBtn}>+ 添加跳转规则</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={styles.saveBar}>
        <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>{saving ? "保存中..." : isEdit ? "保存修改" : "创建问卷"}</button>
        <button onClick={() => navigate("/admin")} style={styles.cancelBtn}>取消</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 800, margin: "0 auto" },
  section: { background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: "#1a1a1a", marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { display: "block", fontSize: 14, fontWeight: 500, color: "#333", marginBottom: 6 },
  input: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 15, outline: "none", boxSizing: "border-box" as any },
  textarea: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, resize: "vertical", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as any },
  addBtnGroup: { display: "flex", gap: 8, flexWrap: "wrap" },
  addBtn: { padding: "6px 12px", borderRadius: 6, border: "1px solid #4f46e5", background: "#fff", color: "#4f46e5", fontSize: 13, cursor: "pointer" },
  emptyQuestions: { textAlign: "center", padding: 40, color: "#888" },
  questionCard: { border: "1px solid #e5e5e5", borderRadius: 8, marginBottom: 12, overflow: "hidden" },
  questionHeader: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fafafa", borderBottom: "1px solid #e5e5e5", flexWrap: "wrap" as any },
  questionNum: { fontWeight: 700, color: "#4f46e5", fontSize: 14, minWidth: 24 },
  typeSelect: { padding: "6px 10px", borderRadius: 6, border: "2px solid", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#fff" },
  moveBtn: { padding: "4px 10px", border: "none", background: "#f3f4f6", borderRadius: 4, cursor: "pointer", fontSize: 14, color: "#374151" },
  logicBtn: { padding: "4px 10px", border: "1px solid", borderRadius: 4, fontSize: 12, cursor: "pointer", background: "#fff" },
  requiredLabel: { fontSize: 13, color: "#666", display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", cursor: "pointer" },
  deleteBtn: { padding: "4px 10px", border: "none", background: "#fef2f2", color: "#dc2626", borderRadius: 4, fontSize: 13, cursor: "pointer" },
  questionBody: { padding: 14 },
  questionInput: { width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box" as any },
  optionsEditor: { display: "flex", flexDirection: "column", gap: 8 },
  optionRow: { display: "flex", alignItems: "center", gap: 8 },
  optionIndex: { fontSize: 14, color: "#666", minWidth: 20 },
  optionInput: { flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14, outline: "none" },
  removeOptionBtn: { padding: "4px 10px", border: "none", background: "#fee2e2", color: "#dc2626", borderRadius: 4, cursor: "pointer", fontSize: 16, fontWeight: "bold" as any },
  addOptionBtn: { padding: "6px 12px", border: "1px dashed #ccc", background: "transparent", borderRadius: 6, fontSize: 13, color: "#666", cursor: "pointer", alignSelf: "flex-start" },
  scaleSettings: { display: "flex", flexDirection: "column", gap: 10 },
  scaleRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 },
  scaleInput: { width: 70, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13, textAlign: "center" as any },
  scaleTextInput: { flex: 1, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 },
  saveBar: { display: "flex", gap: 12, justifyContent: "center", padding: "20px 0 40px" },
  saveBtn: { padding: "12px 32px", borderRadius: 8, border: "none", background: "#4f46e5", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  cancelBtn: { padding: "12px 32px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 15, cursor: "pointer" },
  logicEditor: { marginTop: 12, padding: 12, background: "#fefce8", borderRadius: 8, border: "1px solid #fde68a" },
  logicHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  logicTitle: { fontSize: 14, fontWeight: 600, color: "#92400e" },
  logicToggle: { fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" },
  logicCondition: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  logicLabel: { fontSize: 13, color: "#666" },
  logicSelect: { padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 },
  logicRemoveBtn: { padding: "2px 8px", border: "none", background: "#fee2e2", color: "#dc2626", borderRadius: 4, cursor: "pointer" },
  addLogicBtn: { padding: "6px 12px", border: "1px dashed #f59e0b", background: "transparent", borderRadius: 6, fontSize: 13, color: "#d97706", cursor: "pointer" },
};
