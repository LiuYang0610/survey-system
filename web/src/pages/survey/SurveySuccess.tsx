import React from 'react';

export default function SurveySuccess() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.checkIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={styles.title}>提交成功！</h1>
        <p style={styles.message}>感谢您的参与，您的答卷已成功提交。</p>
        <p style={styles.hint}>答卷内容不可修改。</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 20,
    background: '#f5f5f5',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '48px 32px',
    textAlign: 'center',
    maxWidth: 400,
    width: '100%',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  },
  checkIcon: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: '#f0fdf4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a1a1a',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: '#666',
    lineHeight: 1.6,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#999',
  },
};
