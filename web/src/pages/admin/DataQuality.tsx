import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSurveyDetail, runQualityScan, getQualityReport, batchFlagResponses, exportQualityReport } from "../../lib/api";

interface AnomalyFlag {
  rule_id: string;
  rule_name: string;
  severity: "low" | "medium" | "high";
  details: string;
  evidence?: any;
}

interface AnomalyResult {
  response_id: string;
  user_uuid: string;
  submitted_at: string;
  total_score: number;
  flags: AnomalyFlag[];
  is_anomalous: boolean;
}

interface DataQualityReport {
  survey_id: string;
  total_responses: number;
  anomalous_count: number;
  clean_count: number;
  anomaly_rate: number;
  results: AnomalyResult[];
  generated_at: string;
}

export default function DataQuality() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [survey, setSurvey] = useState<any>(null);
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<"all" | "anomalous" | "clean">("all");
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const surveyData = await getSurveyDetail(id!);
      setSurvey(surveyData);
      
      try {
        const reportData = await getQualityReport(id!);
        setReport(reportData.report);
      } catch {
        // No report yet
      }
    } catch (err: any) {
      alert(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await runQualityScan(id!);
      setReport(result.report);
      alert("质量检测完成！发现 " + result.report.anomalous_count + " 份异常答卷");
    } catch (err: any) {
      alert(err.message || "检测失败");
    } finally {
      setScanning(false);
    }
  };

  const handleSelectResult = (responseId: string) => {
    setSelectedResults(prev => 
      prev.includes(responseId) 
        ? prev.filter(id => id !== responseId)
        : [...prev, responseId]
    );
  };

  const handleSelectAll = () => {
    if (!report) return;
    const filtered = getFilteredResults();
    if (selectedResults.length === filtered.length) {
      setSelectedResults([]);
    } else {
      setSelectedResults(filtered.map(r => r.response_id));
    }
  };

  const handleBatchFlag = async (isFlagged: boolean) => {
    if (selectedResults.length === 0) return;
    try {
      await batchFlagResponses(id!, selectedResults, isFlagged, isFlagged ? ["数据质量异常"] : []);
      alert(isFlagged ? "已标记 " + selectedResults.length + " 份答卷" : "已取消标记 " + selectedResults.length + " 份答卷");
      setSelectedResults([]);
      loadData();
    } catch (err: any) {
      alert(err.message || "操作失败");
    }
  };

  const handleExport = async (format: string) => {
    try {
      const response = await exportQualityReport(id!, format);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quality_report_${id}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "导出失败");
    }
  };

  const getFilteredResults = (): AnomalyResult[] => {
    if (!report) return [];
    switch (filterType) {
      case "anomalous": return report.results.filter(r => r.is_anomalous);
      case "clean": return report.results.filter(r => !r.is_anomalous);
      default: return report.results;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return { bg: "#fee2e2", text: "#dc2626" };
      case "medium": return { bg: "#fef3c7", text: "#d97706" };
      case "low": return { bg: "#dbeafe", text: "#2563eb" };
      default: return { bg: "#f3f4f6", text: "#6b7280" };
    }
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

  const filteredResults = getFilteredResults();

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => navigate("/admin/survey/" + id + "/stats")} style={{ padding: "8px 16px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", marginRight: 8 }}>
          ← 返回统计
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", marginTop: 16 }}>数据质量检测</h1>
        <p style={{ color: "#666", marginTop: 4 }}>{survey.title}</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>总答卷数</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{report?.total_responses || 0}</p>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>异常答卷</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>{report?.anomalous_count || 0}</p>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>正常答卷</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>{report?.clean_count || 0}</p>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>异常率</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: report && report.anomaly_rate > 20 ? "#dc2626" : "#10b981" }}>
            {report?.anomaly_rate || 0}%
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleScan} disabled={scanning} style={{ padding: "10px 20px", background: scanning ? "#9ca3af" : "#4f46e5", color: "#fff", border: "none", borderRadius: 8, cursor: scanning ? "not-allowed" : "pointer", fontWeight: 600 }}>
            {scanning ? "检测中..." : "🔍 运行质量检测"}
          </button>
          <button onClick={() => handleExport("csv")} disabled={!report} style={{ padding: "10px 20px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: report ? "pointer" : "not-allowed", fontWeight: 600 }}>
            📥 导出报告
          </button>
        </div>
        
        {selectedResults.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>已选 {selectedResults.length} 项</span>
            <button onClick={() => handleBatchFlag(true)} style={{ padding: "8px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              标记异常
            </button>
            <button onClick={() => handleBatchFlag(false)} style={{ padding: "8px 12px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              取消标记
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "all", label: "全部", count: report?.total_responses || 0 },
          { key: "anomalous", label: "异常答卷", count: report?.anomalous_count || 0, color: "#dc2626" },
          { key: "clean", label: "正常答卷", count: report?.clean_count || 0, color: "#10b981" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterType(tab.key as any)}
            style={{
              padding: "8px 16px",
              background: filterType === tab.key ? "#4f46e5" : "#fff",
              color: filterType === tab.key ? "#fff" : tab.color || "#374151",
              border: filterType === tab.key ? "none" : "1px solid #e5e7eb",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: filterType === tab.key ? 600 : 400,
              fontSize: 13,
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Results List */}
      {report && filteredResults.length > 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="checkbox"
              checked={selectedResults.length === filteredResults.length && filteredResults.length > 0}
              onChange={handleSelectAll}
              style={{ accentColor: "#4f46e5" }}
            />
            <span style={{ fontSize: 13, color: "#6b7280" }}>全选</span>
          </div>
          
          {filteredResults.map((result) => {
            const isExpanded = expandedResult === result.response_id;
            return (
              <div key={result.response_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <div 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    padding: "12px 16px",
                    background: result.is_anomalous ? "#fef2f2" : "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedResult(isExpanded ? null : result.response_id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedResults.includes(result.response_id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectResult(result.response_id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: "#4f46e5", marginRight: 12 }}
                  />
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, color: "#6b7280" }}>
                        {new Date(result.submitted_at).toLocaleString("zh-CN")}
                      </span>
                      {result.is_anomalous && (
                        <span style={{ padding: "2px 8px", background: "#fee2e2", color: "#dc2626", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          异常
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      {result.flags.map((flag, idx) => {
                        const colors = getSeverityColor(flag.severity);
                        return (
                          <span key={idx} style={{ padding: "2px 8px", background: colors.bg, color: colors.text, borderRadius: 4, fontSize: 11 }}>
                            {flag.rule_name}
                          </span>
                        );
                      })}
                      {result.flags.length === 0 && (
                        <span style={{ padding: "2px 8px", background: "#dcfce7", color: "#16a34a", borderRadius: 4, fontSize: 11 }}>
                          正常
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: result.total_score >= 50 ? "#dc2626" : result.total_score >= 30 ? "#f59e0b" : "#10b981" }}>
                      {result.total_score}
                    </span>
                    <span style={{ fontSize: 11, color: "#6b7280", display: "block" }}>风险分</span>
                  </div>
                  
                  <span style={{ marginLeft: 12, color: "#9ca3af", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
                    ▼
                  </span>
                </div>
                
                {isExpanded && (
                  <div style={{ padding: "16px", background: "#f9fafb", borderTop: "1px solid #e5e7eb" }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>检测详情</h4>
                    {result.flags.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {result.flags.map((flag, idx) => {
                          const colors = getSeverityColor(flag.severity);
                          return (
                            <div key={idx} style={{ padding: 12, background: "#fff", borderRadius: 8, border: `1px solid ${colors.bg}` }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ padding: "2px 8px", background: colors.bg, color: colors.text, borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                  {flag.severity === "high" ? "高" : flag.severity === "medium" ? "中" : "低"}
                                </span>
                                <span style={{ fontWeight: 600, color: "#374151" }}>{flag.rule_name}</span>
                              </div>
                              <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>{flag.details}</p>
                              {flag.evidence && (
                                <pre style={{ marginTop: 8, padding: 8, background: "#f3f4f6", borderRadius: 4, fontSize: 11, overflow: "auto" }}>
                                  {JSON.stringify(flag.evidence, null, 2)}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ color: "#10b981", fontSize: 13 }}>未检测到异常</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, padding: "60px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <p style={{ color: "#9ca3af", fontSize: 15 }}>
            {report ? "当前筛选条件下无数据" : "暂无检测报告，请点击【运行质量检测】开始分析"}
          </p>
        </div>
      )}
    </div>
  );
}