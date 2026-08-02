import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = "https://survey-system.19355681226.workers.dev";

async function apiRequest(url: string, options: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem('admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const response = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

interface User {
  id: string;
  username: string;
  display_name: string;
  role: string;
}

export default function UserManage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const data = await apiRequest('/api/admin/users/list');
      setUsers(data.users || []);
      // 获取当前用户信息
      const me = await apiRequest('/api/auth/me');
      setCurrentUser(me.user);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const updateData: any = {};
      if (editDisplayName) updateData.display_name = editDisplayName;
      if (editPassword && editPassword.length >= 6) updateData.password = editPassword;
      
      await apiRequest(`/api/admin/users/update/${editingUser.username}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
      alert('更新成功');
      setShowEditModal(false);
      loadUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`确定要删除用户「${user.display_name}」吗？`)) return;
    try {
      await apiRequest(`/api/admin/users/delete/${user.username}`, { method: 'DELETE' });
      alert('删除成功');
      loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isAdmin = currentUser?.username === 'admin';

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>👤 {isAdmin ? '用户管理' : '个人信息'}</h2>
        <p style={styles.subtitle}>{isAdmin ? '管理系统中所有用户' : '查看和修改您的账户信息'}</p>
      </div>

      {/* 用户列表 */}
      <div style={styles.userList}>
        {users.map(user => (
          <div key={user.id} style={styles.userCard}>
            <div style={{
              ...styles.userAvatar,
              background: user.role === 'admin' ? '#4f46e5' : '#10b981',
            }}>
              {(user.display_name || user.username)[0]}
            </div>
            <div style={styles.userInfo}>
              <div style={styles.userName}>{user.display_name || user.username}</div>
              <div style={styles.userUsername}>@{user.username} · {user.role === 'admin' ? '管理员' : '用户'}</div>
            </div>
            {user.username === currentUser?.username && <span style={styles.currentBadge}>当前用户</span>}
            <div style={styles.userActions}>
              <button onClick={() => {
                setEditingUser(user);
                setEditDisplayName(user.display_name || '');
                setEditPassword('');
                setShowEditModal(true);
              }} style={styles.editBtn}>✏️ 编辑</button>
              {isAdmin && user.username !== currentUser?.username && (
                <button onClick={() => handleDelete(user)} style={styles.deleteBtn}>🗑️ 删除</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 编辑用户弹窗 */}
      {showEditModal && editingUser && (
        <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>✏️ {editingUser.username === currentUser?.username ? '修改个人信息' : '编辑用户'}</h3>
            <div style={styles.modalBody}>
              <div style={styles.field}>
                <label style={styles.label}>用户名</label>
                <input value={editingUser.username} disabled style={{...styles.input, background: '#f5f5f5'}} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>显示名称</label>
                <input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} style={styles.input} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>新密码（留空不修改）</label>
                <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="输入新密码" style={styles.input} />
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowEditModal(false)} style={styles.cancelBtn}>取消</button>
              <button onClick={handleUpdate} disabled={saving} style={styles.confirmBtn}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 800, margin: '0 auto' },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666' },
  userList: { display: 'flex', flexDirection: 'column', gap: 12 },
  userCard: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  userAvatar: { width: 48, height: 48, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: 600, color: '#1a1a1a' },
  userUsername: { fontSize: 13, color: '#666' },
  currentBadge: { padding: '4px 10px', borderRadius: 20, background: '#dcfce7', color: '#16a34a', fontSize: 12, fontWeight: 500 },
  userActions: { display: 'flex', gap: 8 },
  editBtn: { padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 14, cursor: 'pointer' },
  deleteBtn: { padding: '8px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 14, cursor: 'pointer' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modalContent: { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 600, margin: '0 0 20px' },
  modalBody: {},
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#333' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none', boxSizing: 'border-box' as any },
  cancelBtn: { padding: '10px 20px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 14, cursor: 'pointer' },
  confirmBtn: { padding: '10px 20px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
};
