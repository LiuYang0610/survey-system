import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSurveyDetail, getSurveyStats } from '../../lib/api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#4f46e5', '#7c3aed', '#059669', '#d97706', '#dc2626', '#2563eb', '#ea580c', '#16a34a'];

export default function SurveyStats() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [survey, setSurvey] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  
  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);
  
  const loadData = async () => {
    try {
      const [statsData, surveyData] = await Promise.all([
        getSurveyStats(id!),
        getSurveyDetail(id!),
      ]);
      
      setStats(statsData);
      setSurvey(surveyData);
      setQuestions(surveyData.questions || []);
      
      // 加载答卷数据（用于统计）
      const token = localStorage.getItem('admin_token');
      const resp = await fetch(`/api/admin/surveys/${id}/responses?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const respData = await resp.json();
      setResponses(respData.responses || []);
    } catch (err: any) {
      alert(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };
  
  // 计算单题统计
  const getQuestionStats = (question: any) => {
    const answers = responses.map((r) => r.answers[question.id]).filter((a) => a !== undefined && a !== null);
    
    if (question.type === 'single') {
      // 单选统计
      const counts: Record<string, number> = {};
      question.options.forEach((opt: string) => { counts[opt] = 0; });
      answers.forEach((a: any) => {
        if (counts[a] !== undefined) counts[a]++;
      });
      return {
        type: 'pie',
        data: Object.entries(counts).map(([name, value]) => ({ name, value })),
      };
    }
    
    if (question.type === 'multiple') {
      // 多选统计
      const counts: Record<string, number> = {};
      question.options.forEach((opt: string) => { counts[opt] = 0; });
      answers.forEach((a: any) => {
        if (Array.isArray(a)) {
          a.forEach((v: string) => {
            if (counts[v] !== undefined) counts[v]++;
          });
        }
      });
      return {
        type: 'bar',
        data: Object.entries(counts).map(([name, value]) => ({ name, value })),
      };
    }
    
    if (question.type === 'scale') {
      // 量表统计
      const counts: Record<number, number> = {};
      for (let i = question.scale_min; i <= question.scale_max; i++) {
        counts[i] = 0;
      }
      answers.forEach((a: any) => {
        if (counts[a] !== undefined) counts[a]++;
      });
      return {
        type: 'bar',
        data: Object.entries(counts).map(([name, value]) => ({
          name: `${name}分`,
          value,
        })),
      };
    }
    
    // 填空统计
    return {
      type: 'text',
      data: answers.map((a: any) => String(a)),
    };
  };
  
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;
  }
  
  if (!stats || !survey) {
    return <div style={{ padding: 40, textAlign: 'center' }}>加载失败</div>;
  }
  
  return (
    <div style={styles.container}>
      {/* 问卷概览 */}
      <div style={styles.overviewCard}>
        <h2 style={styles.surveyTitle}>{survey.title}</h2>
        <div style={styles.statsGrid}>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats.total_views}</div>
            <div style={styles.statLabel}>访问人数</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats.total_starts}</div>
            <div style={styles.statLabel}>开始填写</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats.total_submissions}</div>
            <div style={styles.statLabel}>有效答卷</div>
          </div>
          <div style={styles.statItem}>
            <div style={{...styles.statValue, color: '#16a34a'}}>{stats.completion_rate}%</div>
            <div style={styles.statLabel}>完成率</div>
          </div>
        </div>
      </div>
      
      {/* 单题统计 */}
      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>单题统计</h3>
        {questions.map((q: any) => {
          const qStats = getQuestionStats(q);
          
          return (
            <div key={q.id} style={styles.questionStat}>
              <h4 style={styles.questionTitle}>
                {q.sort_order}. {q.title}
                <span style={styles.questionType}>
                  {q.type === 'single' ? '单选' :
                   q.type === 'multiple' ? '多选' :
                   q.type === 'text' ? '填空' : '量表'}
                </span>
              </h4>
              
              {qStats.type === 'pie' && (
                <div style={styles.chartContainer}>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={qStats.data}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {qStats.data.map((_: any, index: number) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              
              {qStats.type === 'bar' && (
                <div style={styles.chartContainer}>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={qStats.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              
              {qStats.type === 'text' && (
                <div style={styles.textList}>
                  {qStats.data.length === 0 ? (
                    <div style={styles.emptyText}>暂无回答</div>
                  ) : (
                    <div style={styles.textContent}>
                      {qStats.data.slice(0, 20).map((text: string, idx: number) => (
                        <div key={idx} style={styles.textItem}>
                          <span style={styles.textIndex}>{idx + 1}.</span>
                          {text}
                        </div>
                      ))}
                      {qStats.data.length > 20 && (
                        <div style={styles.moreText}>... 共 {qStats.data.length} 条回答</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div style={styles.actions}>
        <button onClick={() => navigate('/admin')} style={styles.secondaryBtn}>
          返回列表
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 900,
    margin: '0 auto',
  },
  overviewCard: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    borderRadius: 12,
    padding: '24px 28px',
    color: '#fff',
    marginBottom: 16,
  },
  surveyTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
  },
  statItem: {
    textAlign: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 4,
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 16,
  },
  questionStat: {
    borderBottom: '1px solid #f0f0f0',
    padding: '16px 0',
  },
  questionTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  questionType: {
    fontSize: 12,
    fontWeight: 400,
    padding: '2px 8px',
    borderRadius: 4,
    background: '#f0f0f0',
    color: '#666',
  },
  chartContainer: {
    padding: '8px 0',
  },
  textList: {
    padding: '8px 0',
  },
  textContent: {
    fontSize: 14,
  },
  textItem: {
    padding: '6px 0',
    borderBottom: '1px solid #f5f5f5',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  textIndex: {
    color: '#999',
    minWidth: 20,
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  moreText: {
    color: '#999',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px 0 40px',
  },
  secondaryBtn: {
    padding: '10px 24px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 14,
    cursor: 'pointer',
  },
};
