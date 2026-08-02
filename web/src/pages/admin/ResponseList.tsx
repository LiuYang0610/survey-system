import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSurveyDetail, getSurveyResponses, getExportData } from '../../lib/api';

export default function ResponseList() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedResponse, setSelectedResponse] = useState<any>(null);
  
  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id, page, startDate, endDate]);
  
  const loadData = async () => {
    setLoading(true);
    try {
      const [surveyData, responsesData] = await Promise.all([
        getSurveyDetail(id!),
        getSurveyResponses(id!, page, 20, startDate || undefined, endDate || undefined),
      ]);
      
      setSurvey(surveyData);
      setQuestions(surveyData.questions || []);
      setResponses(responsesData.responses);
      setTotal(responsesData.total);
    } catch (err: any) {
      alert(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  
  // 导出为 Excel
  const handleExport = async () => {
    try {
      const data = await getExportData(id!);
      
      // 构建 CSV 内容
      const headers = ['提交时间', '用户ID', ...questions.map((q: any) => q.title)];
      const rows = data.responses.map((r: any) => [
        r.submitted_at,
        r.user_uuid.substring(0, 8) + '...',
        ...questions.map((q: any) => {
          const answer = r.answers[q.id];
          if (answer === undefined || answer === null) return '';
          if (Array.isArray(answer)) return answer.join(', ');
          return String(answer);
        }),
      ]);
      
      // 生成 CSV（支持中文）
      const BOM = '\uFEFF';
      const csvContent = BOM + [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${survey.title}_答卷数据_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || '导出失败');
    }
  };
  
  // 获取答案显示文本
  const getAnswerText = (question: any, answer: any) => {
    if (answer === undefined || answer === null) return '-';
    if (Array.isArray(answer)) return answer.join(', ');
    return String(answer);
  };
  
  return (
    <div style={styles.container}>
      {/* 筛选栏 */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            style={styles.dateInput}
          />
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>结束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            style={styles.dateInput}
          />
        </div>
        <div style={styles.filterActions}>
          <button onClick={handleExport} style={styles.exportBtn}>
            📥 导出数据
          </button>
          <button onClick={() => navigate('/admin')} style={styles.backBtn}>
            返回列表
          </button>
        </div>
      </div>
      
      {/* 答卷列表 */}
      {loading ? (
        <div style={styles.loading}>加载中...</div>
      ) : responses.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📝</div>
          <p>暂无答卷数据</p>
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>序号</th>
                <th style={styles.th}>提交时间</th>
                {questions.slice(0, 5).map((q: any) => (
                  <th key={q.id} style={styles.th}>{q.title}</th>
                ))}
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {responses.map((r, idx) => (
                <tr key={r.id} style={styles.tr}>
                  <td style={styles.td}>{(page - 1) * 20 + idx + 1}</td>
                  <td style={styles.td}>
                    {new Date(r.submitted_at).toLocaleString('zh-CN')}
                  </td>
                  {questions.slice(0, 5).map((q: any) => (
                    <td key={q.id} style={styles.td}>
                      <div style={styles.answerCell}>
                        {getAnswerText(q, r.answers[q.id])}
                      </div>
                    </td>
                  ))}
                  <td style={styles.td}>
                    <button
                      onClick={() => setSelectedResponse(r)}
                      style={styles.detailBtn}
                    >
                      详情
                    </button>
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
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={styles.pageBtn}
          >
            上一页
          </button>
          <span style={styles.pageInfo}>第 {page} 页 / 共 {Math.ceil(total / 20)} 页 (共 {total} 条)</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page * 20 >= total}
            style={styles.pageBtn}
          >
            下一页
          </button>
        </div>
      )}
      
      {/* 答卷详情弹窗 */}
      {selectedResponse && (
        <div style={styles.modal} onClick={() => setSelectedResponse(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>答卷详情</h3>
              <button onClick={() => setSelectedResponse(null)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.metaInfo}>
                <p>提交时间：{new Date(selectedResponse.submitted_at).toLocaleString('zh-CN')}</p>
                <p>用户标识：{selectedResponse.user_uuid.substring(0, 12)}...</p>
              </div>
              {questions.map((q: any) => (
                <div key={q.id} style={styles.detailItem}>
                  <div style={styles.detailQ}>
                    {q.sort_order}. {q.title}
                    {q.required ? <span style={{ color: '#dc2626' }}> *</span> : null}
                  </div>
                  <div style={styles.detailA}>
                    {getAnswerText(q, selectedResponse.answers[q.id])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {},
  filterBar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 16,
    marginBottom: 20,
    flexWrap: 'wrap',
    background: '#fff',
    padding: '16px 20px',
    borderRadius: 10,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  filterLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: 500,
  },
  dateInput: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
  },
  filterActions: {
    display: 'flex',
    gap: 8,
    marginLeft: 'auto',
  },
  exportBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#059669',
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  backBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 13,
    cursor: 'pointer',
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
    overflow: 'auto',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 600,
  },
  th: {
    padding: '12px 14px',
    textAlign: 'left',
    fontSize: 13,
    fontWeight: 600,
    color: '#666',
    borderBottom: '1px solid #f0f0f0',
    background: '#fafafa',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #f0f0f0',
  },
  td: {
    padding: '12px 14px',
    fontSize: 13,
    color: '#333',
  },
  answerCell: {
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  detailBtn: {
    padding: '4px 12px',
    borderRadius: 4,
    border: '1px solid #4f46e5',
    background: '#fff',
    color: '#4f46e5',
    fontSize: 12,
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
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
  modal: {
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
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #f0f0f0',
  },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 24,
    cursor: 'pointer',
    color: '#666',
  },
  modalBody: {
    padding: 20,
  },
  metaInfo: {
    marginBottom: 16,
    fontSize: 13,
    color: '#666',
    lineHeight: 1.8,
  },
  detailItem: {
    marginBottom: 14,
  },
  detailQ: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
    marginBottom: 4,
  },
  detailA: {
    fontSize: 14,
    color: '#4f46e5',
    paddingLeft: 20,
  },
};
