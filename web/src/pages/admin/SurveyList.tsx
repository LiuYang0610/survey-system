import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSurveys, deleteSurvey, uploadAndParseFile, confirmImport } from '../../lib/api';

interface Survey {
  id: string;
  unique_key: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  views: number;
  submissions: number;
  owner?: string;
  owner_name?: string;
}

interface ParsedQuestion {
  sort_order: number;
  type: 'single' | 'multiple' | 'text' | 'scale';
  title: string;
  description: string;
  required: boolean;
  options: string[];
  scale_min: number;
  scale_max: number;
  scale_min_label: string;
  scale_max_label: string;
}

export default function SurveyList() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  
  // 导入相关状态
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsedData, setParsedData] = useState<{
    title: string;
    description: string;
    questions: ParsedQuestion[];
    source_file: string;
  } | null>(null);
  const [importingConfirm, setImportingConfirm] = useState(false);

  const loadSurveys = async () => {
    setLoading(true);
    try {
      const data = await getSurveys(page, 20, search);
      setSurveys(data.surveys);
      setTotal(data.total);
    } catch (err: any) {
      alert(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSurveys();
  }, [page, search]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定要删除问卷「${title}」吗？此操作不可撤销。`)) return;
    try {
      await deleteSurvey(id);
      loadSurveys();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleCopyLink = (uniqueKey: string) => {
    const url = `${window.location.origin}/s/${uniqueKey}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('链接已复制到剪贴板');
    });
  };

  // 文件上传处理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'docx', 'pdf'].includes(ext || '')) {
      setParseError('仅支持 .xlsx / .docx / .pdf 格式');
      setShowImportModal(true);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setParseError('文件大小不能超过 10MB');
      setShowImportModal(true);
      return;
    }

    setParsing(true);
    setParseError('');
    setShowImportModal(true);

    try {
      const result = await uploadAndParseFile(file);
      setParsedData({
        title: result.title || '',
        description: result.description || '',
        questions: (result.questions || []).map((q: any, idx: number) => ({
          ...q,
          sort_order: q.sort_order || idx + 1,
          required: q.required || false,
          options: q.options || [],
        })),
        source_file: file.name,
      });
    } catch (err: any) {
      setParseError(err.message || '解析失败');
    } finally {
      setParsing(false);
    }

    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 更新解析后的题目
  const updateParsedQuestion = (index: number, updates: Partial<ParsedQuestion>) => {
    if (!parsedData) return;
    const newQuestions = [...parsedData.questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setParsedData({ ...parsedData, questions: newQuestions });
  };

  // 删除解析后的题目
  const removeParsedQuestion = (index: number) => {
    if (!parsedData) return;
    const newQuestions = parsedData.questions.filter((_, i) => i !== index);
    setParsedData({ ...parsedData, questions: newQuestions });
  };

  // 确认导入
  const handleConfirmImport = async () => {
    if (!parsedData?.title.trim()) {
      alert('请输入问卷标题');
      return;
    }
    if (parsedData.questions.length === 0) {
      alert('请至少添加一道题目');
      return;
    }

    setImportingConfirm(true);
    try {
      await confirmImport({
        title: parsedData.title,
        description: parsedData.description,
        questions: parsedData.questions.map(q => ({
          ...q,
          required: q.required ? 1 : 0,
        })),
      });
      alert('导入成功！');
      setShowImportModal(false);
      setParsedData(null);
      loadSurveys();
    } catch (err: any) {
      alert(err.message || '导入失败');
    } finally {
      setImportingConfirm(false);
    }
  };

  // 关闭弹窗
  const closeImportModal = () => {
    setShowImportModal(false);
    setParsedData(null);
    setParseError('');
  };

  return (
    <div>
      {/* 操作栏 */}
      <div style={styles.toolbar}>
        <div style={styles.searchBox}>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索问卷标题..."
            style={styles.searchInput}
          />
        </div>
        <div style={styles.actions}>
          <label style={styles.importBtn}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.docx,.pdf"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            📄 导入文件
          </label>
          <button onClick={() => navigate('/admin/survey/new')} style={styles.primaryBtn}>
            + 创建问卷
          </button>
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{total}</div>
          <div style={styles.statLabel}>问卷总数</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{surveys.filter(s => s.status === 'active').length}</div>
          <div style={styles.statLabel}>进行中</div>
        </div>
      </div>
      
      {/* 问卷列表 */}
      {loading ? (
        <div style={styles.loading}>加载中...</div>
      ) : surveys.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📋</div>
          <p>暂无问卷</p>
          <button onClick={() => navigate('/admin/survey/new')} style={styles.primaryBtn}>
            创建第一个问卷
          </button>
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>问卷标题</th>
                <th style={styles.th}>状态</th>
                <th style={{...styles.th, textAlign: 'center'}}>访问量</th>
                <th style={{...styles.th, textAlign: 'center'}}>答卷数</th>
                <th style={styles.th}>创建者</th>
                <th style={styles.th}>创建时间</th>
                <th style={{...styles.th, textAlign: 'right'}}>操作</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((survey) => (
                <tr key={survey.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.surveyTitle}>{survey.title}</div>
                    {survey.description && (
                      <div style={styles.surveyDesc}>{survey.description}</div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.statusBadge,
                      ...(survey.status === 'active' ? styles.statusActive : styles.statusInactive),
                    }}>
                      {survey.status === 'active' ? '进行中' : '已停止'}
                    </span>
                  </td>
                  <td style={{...styles.td, textAlign: 'center'}}>{survey.views || 0}</td>
                  <td style={{...styles.td, textAlign: 'center'}}>{survey.submissions || 0}</td>
                  <td style={styles.td}>{survey.owner_name || survey.owner || '-'}</td>
                  <td style={styles.td}>{new Date(survey.created_at).toLocaleDateString('zh-CN')}</td>
                  <td style={styles.td}>
                    <div style={styles.btnGroup}>
                      <button onClick={() => navigate(`/admin/survey/${survey.id}/edit`)} style={styles.smallBtn} title="编辑">✏️</button>
                      <button onClick={() => handleCopyLink(survey.unique_key)} style={styles.smallBtn} title="复制链接">🔗</button>
                      <button onClick={() => navigate(`/admin/survey/${survey.id}/stats`)} style={styles.smallBtn} title="统计">📊</button>
                      <button onClick={() => handleDelete(survey.id, survey.title)} style={{...styles.smallBtn, color: '#dc2626'}} title="删除">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* 分页 */}
      {total > 20 && (
        <div style={styles.pagination}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={styles.pageBtn}>上一页</button>
          <span style={styles.pageInfo}>第 {page} 页 / 共 {Math.ceil(total / 20)} 页</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} style={styles.pageBtn}>下一页</button>
        </div>
      )}

      {/* 导入弹窗 */}
      {showImportModal && (
        <div style={styles.modalOverlay} onClick={closeImportModal}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>📄 导入问卷</h3>
              <button onClick={closeImportModal} style={styles.modalClose}>×</button>
            </div>
            
            <div style={styles.modalBody}>
              {parsing ? (
                <div style={styles.loadingBox}>
                  <div style={styles.spinner}></div>
                  <p>正在解析文件...</p>
                </div>
              ) : parseError ? (
                <div style={styles.errorBox}>{parseError}</div>
              ) : parsedData ? (
                <>
                  <div style={styles.fileInfo}>
                    <span style={styles.fileTag}>已解析</span>
                    <span style={styles.fileName}>{parsedData.source_file}</span>
                    <span style={styles.questionCount}>共 {parsedData.questions.length} 道题目</span>
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>问卷标题 *</label>
                    <input
                      type="text"
                      value={parsedData.title}
                      onChange={e => setParsedData({ ...parsedData, title: e.target.value })}
                      style={styles.input}
                      placeholder="请输入问卷标题"
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>问卷说明（可选）</label>
                    <textarea
                      value={parsedData.description}
                      onChange={e => setParsedData({ ...parsedData, description: e.target.value })}
                      style={styles.textarea}
                      placeholder="请输入问卷说明"
                      rows={2}
                    />
                  </div>

                  <div style={styles.questionsSection}>
                    <h4 style={styles.sectionTitle}>题目列表</h4>
                    {parsedData.questions.map((q, idx) => (
                      <div key={idx} style={styles.questionCard}>
                        <div style={styles.questionHeader}>
                          <span style={styles.questionNum}>{idx + 1}</span>
                          <select
                            value={q.type}
                            onChange={e => updateParsedQuestion(idx, { type: e.target.value as any })}
                            style={styles.typeSelect}
                          >
                            <option value="single">单选</option>
                            <option value="multiple">多选</option>
                            <option value="text">填空</option>
                            <option value="scale">量表</option>
                          </select>
                          <label style={styles.requiredLabel}>
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={e => updateParsedQuestion(idx, { required: e.target.checked })}
                            />
                            必填
                          </label>
                          <button onClick={() => removeParsedQuestion(idx)} style={styles.removeBtn}>删除</button>
                        </div>
                        <input
                          type="text"
                          value={q.title}
                          onChange={e => updateParsedQuestion(idx, { title: e.target.value })}
                          style={styles.questionInput}
                          placeholder="请输入题目标题"
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={styles.uploadArea}>
                  <div style={styles.uploadIcon}>📁</div>
                  <p style={styles.uploadText}>支持 .xlsx / .docx / .pdf 格式</p>
                  <p style={styles.uploadHint}>文件大小不超过 10MB</p>
                </div>
              )}
            </div>

            <div style={styles.modalFooter}>
              <button onClick={closeImportModal} style={styles.cancelBtn}>取消</button>
              {parsedData && (
                <button
                  onClick={handleConfirmImport}
                  disabled={importingConfirm || !parsedData.title.trim() || parsedData.questions.length === 0}
                  style={{
                    ...styles.confirmBtn,
                    opacity: (importingConfirm || !parsedData.title.trim() || parsedData.questions.length === 0) ? 0.5 : 1,
                  }}
                >
                  {importingConfirm ? '导入中...' : '确认导入'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 200,
    maxWidth: 400,
  },
  searchInput: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  importBtn: {
    padding: '10px 20px',
    borderRadius: 8,
    border: '2px dashed #4f46e5',
    background: '#fff',
    color: '#4f46e5',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtn: {
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  statsRow: {
    display: 'flex',
    gap: 16,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    background: '#fff',
    borderRadius: 10,
    padding: '16px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 700,
    color: '#4f46e5',
  },
  statLabel: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  loading: {
    textAlign: 'center',
    padding: 40,
    color: '#888',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    background: '#fff',
    borderRadius: 10,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  tableContainer: {
    background: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 13,
    fontWeight: 600,
    color: '#666',
    borderBottom: '1px solid #f0f0f0',
    background: '#fafafa',
  },
  tr: {
    borderBottom: '1px solid #f0f0f0',
  },
  td: {
    padding: '14px 16px',
    fontSize: 14,
    color: '#333',
  },
  surveyTitle: {
    fontWeight: 600,
    marginBottom: 2,
  },
  surveyDesc: {
    fontSize: 12,
    color: '#999',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 250,
  },
  statusBadge: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500,
  },
  statusActive: {
    background: '#f0fdf4',
    color: '#16a34a',
  },
  statusInactive: {
    background: '#fef2f2',
    color: '#dc2626',
  },
  btnGroup: {
    display: 'flex',
    gap: 4,
    justifyContent: 'flex-end',
  },
  smallBtn: {
    padding: '4px 8px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    fontSize: 16,
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
    padding: '12px 0',
  },
  pageBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  pageInfo: {
    fontSize: 13,
    color: '#666',
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20,
  },
  modalContent: {
    background: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 600,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
  },
  modalClose: {
    border: 'none',
    background: 'transparent',
    fontSize: 24,
    cursor: 'pointer',
    color: '#666',
  },
  modalBody: {
    flex: 1,
    overflow: 'auto',
    padding: 20,
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    padding: '16px 20px',
    borderTop: '1px solid #eee',
  },
  loadingBox: {
    textAlign: 'center',
    padding: 40,
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #4f46e5',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px',
  },
  errorBox: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 14,
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: '#f0fdf4',
    borderRadius: 8,
    marginBottom: 16,
  },
  fileTag: {
    padding: '2px 8px',
    background: '#16a34a',
    color: '#fff',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
  },
  fileName: {
    fontSize: 14,
    fontWeight: 500,
  },
  questionCount: {
    marginLeft: 'auto',
    color: '#666',
    fontSize: 13,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 6,
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as any,
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as any,
  },
  questionsSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 12,
  },
  questionCard: {
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    background: '#fafafa',
  },
  questionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  questionNum: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#4f46e5',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
  },
  typeSelect: {
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid #ddd',
    fontSize: 13,
    outline: 'none',
  },
  requiredLabel: {
    fontSize: 13,
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
  },
  removeBtn: {
    marginLeft: 'auto',
    padding: '4px 8px',
    border: 'none',
    background: '#fee2e2',
    color: '#dc2626',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  },
  questionInput: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as any,
  },
  uploadArea: {
    textAlign: 'center',
    padding: '40px 20px',
    border: '2px dashed #ddd',
    borderRadius: 12,
  },
  uploadIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  uploadText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  uploadHint: {
    fontSize: 12,
    color: '#999',
  },
  cancelBtn: {
    padding: '10px 20px',
    borderRadius: 6,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 14,
    cursor: 'pointer',
  },
  confirmBtn: {
    padding: '10px 20px',
    borderRadius: 6,
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
