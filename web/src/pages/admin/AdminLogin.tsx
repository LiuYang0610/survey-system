import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../../lib/api';

const API_BASE = "https://survey-system.19355681226.workers.dev";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isLogin) {
        await adminLogin(username, password);
        navigate('/admin');
      } else {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, display_name: displayName || username }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '注册失败');
        localStorage.setItem('admin_token', data.token);
        navigate('/admin');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>📊</span>
          <h1 style={styles.logoTitle}>问卷系统</h1>
        </div>
        
        <div style={styles.tabs}>
          <button onClick={() => { setIsLogin(true); setError(''); }} style={{...styles.tab, ...(isLogin ? styles.tabActive : {})}}>登录</button>
          <button onClick={() => { setIsLogin(false); setError(''); }} style={{...styles.tab, ...(!isLogin ? styles.tabActive : {})}}>注册新账号</button>
        </div>
        
        {error && <div style={styles.error}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div style={styles.field}>
              <label style={styles.label}>显示名称</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="可选，默认使用用户名" style={styles.input} />
            </div>
          )}
          
          <div style={styles.field}>
            <label style={styles.label}>用户名 *</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={isLogin ? "请输入用户名" : "至少3位"} style={styles.input} required />
          </div>
          
          <div style={styles.field}>
            <label style={styles.label}>密码 *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isLogin ? "请输入密码" : "至少6位"} style={styles.input} required />
          </div>
          
          <button type="submit" disabled={loading} style={{...styles.submitBtn, opacity: loading ? 0.7 : 1}}>
            {loading ? '处理中...' : isLogin ? '登录' : '注册并登录'}
          </button>
        </form>
        
        <div style={styles.hint}>
          <p>{isLogin ? '没有账号？点击"注册新账号"创建' : '已有账号？点击"登录"返回'}</p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20 },
  card: { background: '#fff', borderRadius: 16, padding: 40, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  logo: { textAlign: 'center', marginBottom: 30 },
  logoIcon: { fontSize: 48, display: 'block', marginBottom: 12 },
  logoTitle: { fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  tabs: { display: 'flex', gap: 8, marginBottom: 24, background: '#f5f5f5', borderRadius: 8, padding: 4 },
  tab: { flex: 1, padding: '10px', border: 'none', borderRadius: 6, background: 'transparent', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' },
  tabActive: { background: '#fff', color: '#4f46e5', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  error: { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 14, fontWeight: 500, color: '#333', marginBottom: 6 },
  input: { width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, outline: 'none', boxSizing: 'border-box' as any },
  submitBtn: { width: '100%', padding: '14px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  hint: { textAlign: 'center', marginTop: 20, fontSize: 14, color: '#666' },
};
