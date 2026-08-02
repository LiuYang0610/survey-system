import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSurveyDetail, getSurveyStats, exportQualityReport, runQualityScan } from '../../lib/api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API_BASE = "https://survey-system.19355681226.workers.dev";
const COLORS = ['#4f46e5', '#7c3aed', '#059669', '#d97706', '#dc2626', '#2563eb', '#ea580c', '#16a34a'];

export default function SurveyStats() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [survey, setSurvey] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  
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
      
      const token = localStorage.getItem('admin_token');
      const resp = await fetch(`${API_BASE}/api/admin/surveys/${id}/responses?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const respData = await resp.json();
      setResponses(respData.responses || []);
    } catch (err: any) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // 导出数据
  const handleExport = async (format: string) => {
    try {
      const response = await exportQualityReport(id!, format);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `survey_${id}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('导出失败: ' + err.message);
    }
  };
  
  // 运行质量检测
  const handleQualityScan = async () => {
    setScanning(true);
    try {
      const result = await runQualityScan(id!);
      alert('质量检测完成！发现 ' + result.report.anomalous_count + ' 份异常答卷');
    } catch (err: any) {
      alert('质量检测失败: ' + err.message);
    } finally {
      setScanning(false);
    }
  };
  
  const getQuestionStats = (question: any) => {
    const answers = responses.map((r) => r.answers[question.id]).filter((a) => a !== undefined && a !== null);
    
    if (question.type === 'single') {
      const counts: Record<string, number> = {};
      question.options.forEach((opt: string) => { counts[opt] = 0; });
      answers.forEach((a: any) => { if (counts[a] !== undefined) counts[a]++; });
      return { type: 'pie', data: Object.entries(counts).map(([name, value]) => ({ name, value })) };
    }
    
    if (question.type === 'multiple') {
      const counts: Record<string, number> = {};
      question.options.forEach((opt: string) => { counts[opt] = 0; });
      answers.forEach((a: any) => {
        if (Array.isArray(a)) a.forEach((v: string) => { if (counts[v] !== undefined) counts[v]++; });
      });
      return { type: 'bar', data: Object.entries(counts).map(([name, value]) => ({ name, value })) };
    }
    
    if (question.type === 'scale') {
      const counts: Record<number, number> = {};
      for (let i = question.scale_min; i <= question.scale_max; i++) counts[i] = 0;
      answers.forEach((a: any) => { if (counts[a] !== undefined) counts[a]++; });
      return { type: 'bar', data: Object.entries(counts).map(([name, value]) => ({ name: String(name), value })) };
    }
    
    const textAnswers = answers.filter((a: any) => typeof a === 'string' && a.trim());
    return { type: 'text', data: textAnswers.slice(0, 20).map((a: any, i: number) => ({ name: `回答${i + 1}`, value: a })) };
  };
  
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}><p>加载中...</p></div>;
  if (!survey) return <div style={{ textAlign: 'center', padding: '40px' }}><p>问卷不存在</p><button onClick={() => navigate('/admin')} style={{ marginTop: 12, padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>返回列表</button></div>;
  
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      {/* 标题和操作按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>📊 {survey.title} - 数据统计</h2>
          <div style={{ display: 'flex', gap: 20, color: '#666', fontSize: 14 }}>
            <span>总访问: {stats?.views || 0}</span>
            <span>总提交: {stats?.submissions || 0}</span>
            <span>完成率: {stats?.views ? Math.round((stats.submissions / stats.views) * 100) : 0}%</span>
          </div>
        </div>
        
        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => handleExport('csv')} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #059669', background: '#f0fdf4', color: '#059669', fontSize: 13, cursor: 'pointer' }}>
            📥 导出CSV
          </button>
          <button onClick={handleQualityScan} disabled={scanning} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d97706', background: '#fffbeb', color: '#d97706', fontSize: 13, cursor: 'pointer' }}>
            {scanning ? '检测中...' : '🔍 质量检测'}
          </button>
          <button onClick={() => navigate(`/admin/survey/${id}/responses`)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #4f46e5', background: '#f0f0ff', color: '#4f46e5', fontSize: 13, cursor: 'pointer' }}>
            📋 查看答卷
          </button>
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#f0f9ff', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>{stats?.views || 0}</div>
          <div style={{ fontSize: 13, color: '#666' }}>总访问量</div>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{stats?.submissions || 0}</div>
          <div style={{ fontSize: 13, color: '#666' }}>总提交数</div>
        </div>
        <div style={{ background: '#fefce8', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>{responses.length}</div>
          <div style={{ fontSize: 13, color: '#666' }}>答卷数量</div>
        </div>
      </div>
      
      {/* 题目统计 */}
      {questions.length > 0 && responses.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
          {questions.map((q, idx) => {
            const qStats = getQuestionStats(q);
            return (
              <div key={idx} style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#333' }}>第 {q.sort_order} 题: {q.title}</h4>
                {qStats.type === 'pie' && (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={qStats.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {qStats.data.map((_: any, index: number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {qStats.type === 'bar' && (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={qStats.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#4f46e5" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {qStats.type === 'text' && (
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {qStats.data.map((item: any, i: number) => (
                      <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>{item.value}</div>
                    ))}
                    {qStats.data.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>暂无回答</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: 10 }}>
          <p style={{ color: '#999' }}>{responses.length === 0 ? '暂无答卷数据' : '暂无题目数据'}</p>
        </div>
      )}
    </div>
  );
}
