import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { getAdminMe, adminLogout } from '../../lib/api';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  useEffect(() => {
    async function checkAuth() {
      try {
        const token = localStorage.getItem('admin_token');
        if (!token) {
          navigate('/admin/login');
          return;
        }
        const data = await getAdminMe();
        setUser(data.user);
      } catch {
        localStorage.removeItem('admin_token');
        navigate('/admin/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [navigate]);
  
  const handleLogout = () => {
    adminLogout();
    navigate('/admin/login');
  };
  
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>加载中...</p>
      </div>
    );
  }
  
  const menuItems = [
    { path: '/admin', label: '问卷列表', icon: '📋' },
  ];
  
  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin' || location.pathname === '/admin/surveys';
    return location.pathname.startsWith(path);
  };
  
  return (
    <div style={styles.layout}>
      {/* 侧边栏 */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.sidebarTitle}>📋 问卷管理</h2>
        </div>
        <nav style={styles.nav}>
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                ...styles.navItem,
                ...(isActive(item.path) ? styles.navItemActive : {}),
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <span style={styles.userName}>{user?.display_name || user?.username}</span>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            退出登录
          </button>
        </div>
      </div>
      
      {/* 主内容区 */}
      <div style={styles.main}>
        <div style={styles.topbar}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={styles.menuBtn}
          >
            ☰
          </button>
          <h3 style={styles.pageTitle}>
            {location.pathname.includes('/stats') ? '数据统计' :
             location.pathname.includes('/responses') ? '答卷管理' :
             location.pathname.includes('/import') ? '文件导入' :
             location.pathname.includes('/edit') ? '问卷编辑' :
             location.pathname.includes('/new') ? '创建问卷' : '问卷列表'}
          </h3>
          <div style={styles.topbarRight}></div>
        </div>
        <div style={styles.content}>
          <Outlet />
        </div>
      </div>
      
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          style={styles.overlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
    background: '#f0f2f5',
  },
  sidebar: {
    width: 240,
    background: '#001529',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 200,
    transition: 'transform 0.3s',
  },
  sidebarHeader: {
    padding: '20px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: 700,
  },
  nav: {
    flex: 1,
    padding: '12px 0',
    overflow: 'auto',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 20px',
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: 14,
    transition: 'all 0.2s',
    borderRadius: 0,
  },
  navItemActive: {
    background: '#4f46e5',
    color: '#fff',
  },
  sidebarFooter: {
    padding: '16px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  userInfo: {
    marginBottom: 8,
  },
  userName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  logoutBtn: {
    width: '100%',
    padding: '8px 0',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    marginLeft: 240,
    display: 'flex',
    flexDirection: 'column',
  },
  topbar: {
    background: '#fff',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #e8e8e8',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  menuBtn: {
    display: 'none',
    padding: '4px 8px',
    border: 'none',
    background: 'transparent',
    fontSize: 20,
    cursor: 'pointer',
    marginRight: 12,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
    flex: 1,
  },
  topbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  content: {
    flex: 1,
    padding: 24,
    overflow: 'auto',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 150,
  },
};
