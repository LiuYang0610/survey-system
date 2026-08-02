import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSurveyDetail, getCodingThemes, updateCodingThemes, getCodingDataset, runAiCoding, updateCodingResult, exportCodingDataset } from "../../lib/api";

interface Theme {
  id: string;
  name: string;
  description: string;
  color: string;
}

interface CodingResult {
  response_id: string;
  question_id: string;
  original_text: string;
  themes: string[];
  keywords: string[];
  sentiment?: string;
  confidence: number;
  manually_edited?: boolean;
  created_at: string;
}

interface CodingDataset {
  survey_id: string;
  question_id: string;
  themes: Theme[];
  results: CodingResult[];
  total_responses: number;
  coded_count: number;
}

export default function AiCoding() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<any>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string>("");
  const [themes, setThemes] = useState<Theme[]>([]);
  const [dataset, setDataset] = useState<CodingDataset | null>(null);
  const [editingResult, setEditingResult] = useState<string | null>(null);
  const [editThemes, setEditThemes] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [newTheme, setNewTheme] = useState<Partial<Theme>>({});

  useEffect(() => {
    loadSurvey();
  }, [id]);

  useEffect(() => {
    if (selectedQuestion) loadDataset();
  }, [selectedQuestion]);

  const loadSurvey = async () => {
    try {
      const data = await getSurveyDetail(id!);
      setSurvey(data);
      const textQuestions = data.questions.filter((q: any) => q.type === "text");
      if (textQuestions.length > 0) {
        setSelectedQuestion(textQuestions[0].id);
      }
      const themesData = await getCodingThemes(id!);
      if (themesData.themes && themesData.themes.length > 0) {
        setThemes(themesData.themes);
      } else {
        setThemes([
          { id: "positive", name: "正面评价", description: "积极正向的反馈", color: "#22c55e" },
          { id: "negative", name: "负面评价", description: "消极负向的反馈", color: "#ef4444" },
          { id: "suggestion", name: "改进建议", description: "提出的改进建议", color: "#3b82f6" },
          { id: "question", name: "疑问咨询", description: "提出的问题或疑问", color: "#f59e0b" },
          { id: "other", name: "其他", description: "其他类型的内容", color: "#6b7280" },
        ]);
      }
    } catch (err: any) {
      alert(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadDataset = async () => {
    try {
      const data = await getCodingDataset(id!, selectedQuestion);
      setDataset(data.dataset);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleRunCoding = async () => {
    if (!selectedQuestion) return;
    setRunning(true);
    try {
      const result = await runAiCoding(id!, selectedQuestion);
      setDataset(result.dataset);
      alert("AI编码完成！共处理 " + result.summary.total + " 条回答");
    } catch (err: any) {
      alert(err.message || "编码失败");
    } finally {
      setRunning(false);
    }
  };

  const handleSaveThemes = async () => {
    try {
      await updateCodingThemes(id!, themes);
      setShowThemeEditor(false);
      alert("主题保存成功");
    } catch (err: any) {
      alert(err.message || "保存失败");
    }
  };

  const handleEditResult = (result: CodingResult) => {
    setEditingResult(result.response_id);
    setEditThemes([...result.themes]);
  };

  const handleSaveEdit = async (responseId: string) => {
    try {
      await updateCodingResult(id!, selectedQuestion, responseId, editThemes);
      if (dataset) {
        const updatedResults = dataset.results.map(r => {
          if (r.response_id === responseId) {
            return { ...r, themes: editThemes, manually_edited: true };
          }
          return r;
        });
        setDataset({ ...dataset, results: updatedResults });
      }
      setEditingResult(null);
    } catch (err: any) {
      alert(err.message || "保存失败");
    }
  };

  const handleExport = async (format: string) => {
    try {
      const response = await exportCodingDataset(id!, selectedQuestion, format);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `coding_${selectedQuestion}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "导出失败");
    }
  };

  const addTheme = () => {
    if (!newTheme.name) return;
    const theme: Theme = {
      id: newTheme.id || `theme_${Date.now()}`,
      name: newTheme.name,
      description: newTheme.description || "",
      color: newTheme.color || "#6b7280",
    };
    setThemes([...themes, theme]);
    setNewTheme({});
  };

  const removeTheme = (themeId: string) => {
    setThemes(themes.filter(t => t.id !== themeId));
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
        <p style={{ color: "#666" }}>加载中...</p>
      </div>
    );
  }

  if (!survey) {
    return (
      <div style={{ textAlign: "center", padding: "40px" }}>
        <p style={{ color: "#666" }}>问卷不存在</p>
        <button onClick={() => navigate("/admin")} style={{ marginTop: 12, padding: "8px 16px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
          返回列表
        </button>
      </div>
    );
  }

  const textQuestions = survey.questions.filter((q: any) => q.type === "text");
  const selectedQ = survey.questions.find((q: any) => q.id === selectedQuestion);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => navigate("/admin/survey/" + id + "/stats")} style={{ padding: "8px 16px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", marginRight: 8 }}>
          ← 返回统计
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", marginTop: 16 }}>AI 自动编码</h1>
        <p style={{ color: "#666", marginTop: 4 }}>{survey.title}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        {/* Left Panel */}
        <div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 12 }}>选择题目</h3>
            {textQuestions.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 13 }}>暂无文本题</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {textQuestions.map((q: any) => (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQuestion(q.id)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      background: selectedQuestion === q.id ? "#eef2ff" : "#f9fafb",
                      border: selectedQuestion === q.id ? "2px solid #4f46e5" : "1px solid #e5e7eb",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#4f46e5" }}>第{q.sort_order}题</span>
                    <span style={{ color: "#374151", marginLeft: 8 }}>{q.title}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 12 }}>主题管理</h3>
              <button onClick={() => setShowThemeEditor(!showThemeEditor)} style={{ width: "100%", padding: "8px 12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                {showThemeEditor ? "收起" : "编辑主题"}
              </button>
              
              {showThemeEditor && (
                <div style={{ marginTop: 12 }}>
                  {themes.map((theme) => (
                    <div key={theme.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: theme.color }} />
                      <span style={{ flex: 1, fontSize: 13 }}>{theme.name}</span>
                      <button onClick={() => removeTheme(theme.id)} style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>×</button>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <input value={newTheme.name || ""} onChange={e => setNewTheme({ ...newTheme, name: e.target.value })} placeholder="主题名称" style={{ flex: 1, padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12 }} />
                    <input type="color" value={newTheme.color || "#6b7280"} onChange={e => setNewTheme({ ...newTheme, color: e.target.value })} style={{ width: 32, padding: 0, border: "none", cursor: "pointer" }} />
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button onClick={addTheme} style={{ flex: 1, padding: "6px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>添加</button>
                    <button onClick={handleSaveThemes} style={{ flex: 1, padding: "6px", background: "#10b981", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>保存</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div>
          {selectedQuestion && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a" }}>
                    第{selectedQ?.sort_order}题：{selectedQ?.title}
                  </h2>
                  <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                    共 {dataset?.total_responses || 0} 条回答，已编码 {dataset?.coded_count || 0} 条
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleRunCoding} disabled={running} style={{ padding: "8px 16px", background: running ? "#9ca3af" : "#4f46e5", color: "#fff", border: "none", borderRadius: 6, cursor: running ? "not-allowed" : "pointer", fontSize: 13 }}>
                    {running ? "处理中..." : "🤖 运行AI编码"}
                  </button>
                  <button onClick={() => handleExport("csv")} style={{ padding: "8px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                    📥 导出CSV
                  </button>
                </div>
              </div>

              {/* Theme Distribution */}
              {dataset && dataset.results.length > 0 && (
                <div style={{ marginBottom: 20, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>主题分布</h4>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {themes.map((theme) => {
                      const count = dataset.results.filter(r => r.themes.includes(theme.id)).length;
                      return (
                        <div key={theme.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: theme.color }} />
                          <span style={{ fontSize: 12, color: "#374151" }}>{theme.name}</span>
                          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Results Table */}
              {dataset && dataset.results.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                        <th style={{ textAlign: "left", padding: "12px 8px", fontWeight: 600, color: "#374151" }}>原始文本</th>
                        <th style={{ textAlign: "left", padding: "12px 8px", fontWeight: 600, color: "#374151", minWidth: 120 }}>主题标签</th>
                        <th style={{ textAlign: "left", padding: "12px 8px", fontWeight: 600, color: "#374151", minWidth: 80 }}>情感</th>
                        <th style={{ textAlign: "center", padding: "12px 8px", fontWeight: 600, color: "#374151", minWidth: 60 }}>置信度</th>
                        <th style={{ textAlign: "center", padding: "12px 8px", fontWeight: 600, color: "#374151", minWidth: 80 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataset.results.map((result) => (
                        <tr key={result.response_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "12px 8px", maxWidth: 300 }}>
                            <p style={{ margin: 0, lineHeight: 1.5 }}>{result.original_text}</p>
                            {result.manually_edited && (
                              <span style={{ fontSize: 11, color: "#f59e0b" }}>已手动修改</span>
                            )}
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            {editingResult === result.response_id ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {themes.map((theme) => (
                                  <label key={theme.id} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                    <input
                                      type="checkbox"
                                      checked={editThemes.includes(theme.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) setEditThemes([...editThemes, theme.id]);
                                        else setEditThemes(editThemes.filter(t => t !== theme.id));
                                      }}
                                      style={{ accentColor: theme.color }}
                                    />
                                    <span style={{ fontSize: 12 }}>{theme.name}</span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {result.themes.map((themeId) => {
                                  const theme = themes.find(t => t.id === themeId);
                                  return theme ? (
                                    <span key={themeId} style={{ padding: "2px 8px", background: theme.color + "20", color: theme.color, borderRadius: 4, fontSize: 11 }}>
                                      {theme.name}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <span style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              background: result.sentiment === "positive" ? "#dcfce7" : result.sentiment === "negative" ? "#fee2e2" : "#f3f4f6",
                              color: result.sentiment === "positive" ? "#16a34a" : result.sentiment === "negative" ? "#dc2626" : "#6b7280"
                            }}>
                              {result.sentiment === "positive" ? "正面" : result.sentiment === "negative" ? "负面" : "中性"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            <span style={{ color: result.confidence >= 0.7 ? "#10b981" : result.confidence >= 0.4 ? "#f59e0b" : "#ef4444" }}>
                              {Math.round(result.confidence * 100)}%
                            </span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "center" }}>
                            {editingResult === result.response_id ? (
                              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                <button onClick={() => handleSaveEdit(result.response_id)} style={{ padding: "4px 8px", background: "#10b981", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
                                  保存
                                </button>
                                <button onClick={() => setEditingResult(null)} style={{ padding: "4px 8px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleEditResult(result)} style={{ padding: "4px 8px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
                                编辑
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af" }}>
                  <p>暂无编码数据，请点击"运行AI编码"开始分析</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}