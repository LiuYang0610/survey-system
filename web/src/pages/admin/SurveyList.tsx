import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSurveys, deleteSurvey } from '../../lib/api';

interface Survey {
  id: string;
  unique_key: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  views: number;
  submissions: number;
}

export default function SurveyList() {
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  
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
  
  const handleExportQR = (uniqueKey: string, title: string) => {
    const url = `${window.location.origin}/s/${uniqueKey}`;
    // 生成简单二维码（使用第三方 API）
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `${title}_二维码.png`;
    a.click();
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
                <th style={styles.th}>创建时间</th>
                <th style={{...styles.th, textAlign: 'right'}}>操作</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((survey) => (
                <tr key={survey.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.titleCell}>
                      <div style={styles.surveyTitle}>{survey.title}</div>
                      {survey.description && (
                        <div style={styles.surveyDesc}>{survey.description}</div>
                      )}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.statusBadge,
                      ...(survey.status === 'active' ? styles.statusActive : styles.statusInactive),
                    }}>
                      {survey.status === 'active' ? '进行中' : '已停用'}
                    </span>
                  </td>
                  <td style={{...styles.td, textAlign: 'center'}}>{survey.views}</td>
                  <td style={{...styles.td, textAlign: 'center'}}>{survey.submissions}</td>
                  <td style={styles.td}>
                    {new Date(survey.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={{...styles.td, textAlign: 'right'}}>
                    <div style={styles.btnGroup}>
                      <button
                        onClick={() => navigate(`/admin/survey/${survey.id}/edit`)}
                        style={styles.smallBtn}
                        title="编辑"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleCopyLink(survey.unique_key)}
                        style={styles.smallBtn}
                        title="复制链接"
                      >
                        🔗
                      </button>
                      <button
                        onClick={() => navigate(`/admin/survey/${survey.id}/stats`)}
                        style={styles.smallBtn}
                        title="统计"
                      >
                        📊
                      </button>
                      <button
                        onClick={() => navigate(`/admin/survey/${survey.id}/responses`)}
                        style={styles.smallBtn}
                        title="答卷"
                      >
                        📝
                      </button>
                      <button
                        onClick={() => handleDelete(survey.id, survey.title)}
                        style={{...styles.smallBtn, color: '#dc2626'}}
                        title="删除"
                      >
                        🗑️
                      </button>
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
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={styles.pageBtn}
          >
            上一页
          </button>
          <span style={styles.pageInfo}>第 {page} 页 / 共 {Math.ceil(total / 20)} 页</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page * 20 >= total}
            style={styles.pageBtn}
          >
            下一页
          </button>
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
  titleCell: {},
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
};
