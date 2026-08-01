import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSurvey, getDraft, saveDraft, submitResponse, recordVisit, getUserUuid } from '../../lib/api';

interface Question {
  id: string;
  sort_order: number;
  type: 'single' | 'multiple' | 'text' | 'scale';
  title: string;
  description: string;
  required: number;
  options: string[];
  scale_min: number;
  scale_max: number;
  scale_min_label: string;
  scale_max_label: string;
}

export default function SurveyPage() {
  const { uniqueKey } = useParams<{ uniqueKey: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [surveyId, setSurveyId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // 防抖保存计时器
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 初始化
  useEffect(() => {
    if (!uniqueKey) return;
    
    async function init() {
      try {
        // 记录 unique_key 到 session（用于访问日志）
        sessionStorage.setItem('current_survey_key', uniqueKey!);
        
        const data = await getSurvey(uniqueKey!);
        setSurveyId(data.id);
        setTitle(data.title);
        setDescription(data.description);
        setQuestions(data.questions);
        
        // 记录访问
        await recordVisit(data.id, 'view');
        
        // 加载草稿
        try {
          const draftData = await getDraft(data.id);
          if (draftData.draft?.answers) {
            setAnswers(draftData.draft.answers);
            // 标记开始填写
            await recordVisit(data.id, 'start');
          }
        } catch {
          // 草稿加载失败，忽略
        }
      } catch (err: any) {
        setError(err.message || '加载问卷失败');
      } finally {
        setLoading(false);
      }
    }
    
    init();
  }, [uniqueKey]);
  
  // 防抖自动保存草稿
  const autoSaveDraft = useCallback(
    (newAnswers: Record<string, any>) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(async () => {
        try {
          await saveDraft(surveyId, newAnswers);
        } catch {
          // 草稿保存失败，静默处理
        }
      }, 3000);
    },
    [surveyId]
  );
  
  // 更新答案
  const updateAnswer = (questionId: string, value: any) => {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    // 清除该题的错误
    if (errors[questionId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
    // 触发防抖保存
    autoSaveDraft(newAnswers);
  };
  
  // 表单校验
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    for (const q of questions) {
      if (q.required) {
        const answer = answers[q.id];
        if (answer === undefined || answer === null || answer === '') {
          newErrors[q.id] = `请完成第 ${q.sort_order} 题`;
        } else if (q.type === 'multiple' && Array.isArray(answer) && answer.length === 0) {
          newErrors[q.id] = `请至少选择一个选项`;
        }
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // 提交答卷
  const handleSubmit = async () => {
    if (!validate()) {
      // 滚动到第一个错误
      const firstError = document.querySelector('.field-error');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    
    setSubmitting(true);
    try {
      await submitResponse(surveyId, answers);
      navigate(`/s/${uniqueKey}/success`);
    } catch (err: any) {
      alert(err.message || '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };
  
  // 渲染题目
  const renderQuestion = (q: Question) => {
    const value = answers[q.id];
    const fieldError = errors[q.id];
    
    return (
      <div key={q.id} style={styles.questionCard}>
        <div style={styles.questionHeader}>
          <span style={styles.questionNumber}>{q.sort_order}.</span>
          <span style={styles.questionTitle}>{q.title}</span>
          {q.required === 1 && <span style={styles.required}>*</span>}
        </div>
        
        {q.description && (
          <div style={styles.questionDesc}>{q.description}</div>
        )}
        
        {fieldError && (
          <div className="field-error" style={styles.fieldError}>{fieldError}</div>
        )}
        
        {/* 单选题 */}
        {q.type === 'single' && (
          <div style={styles.optionsContainer}>
            {q.options.map((opt, idx) => (
              <label key={idx} style={styles.optionLabel}>
                <input
                  type="radio"
                  name={`q_${q.id}`}
                  checked={value === opt}
                  onChange={() => updateAnswer(q.id, opt)}
                  style={styles.radioInput}
                />
                <span style={styles.optionText}>{opt}</span>
              </label>
            ))}
          </div>
        )}
        
        {/* 多选题 */}
        {q.type === 'multiple' && (
          <div style={styles.optionsContainer}>
            {q.options.map((opt, idx) => (
              <label key={idx} style={styles.optionLabel}>
                <input
                  type="checkbox"
                  name={`q_${q.id}`}
                  checked={Array.isArray(value) && value.includes(opt)}
                  onChange={(e) => {
                    const current = Array.isArray(value) ? value : [];
                    if (e.target.checked) {
                      updateAnswer(q.id, [...current, opt]);
                    } else {
                      updateAnswer(q.id, current.filter((v: string) => v !== opt));
                    }
                  }}
                  style={styles.checkboxInput}
                />
                <span style={styles.optionText}>{opt}</span>
              </label>
            ))}
          </div>
        )}
        
        {/* 填空题 */}
        {q.type === 'text' && (
          <textarea
            value={value || ''}
            onChange={(e) => updateAnswer(q.id, e.target.value)}
            placeholder="请输入您的回答..."
            style={styles.textarea}
            rows={4}
          />
        )}
        
        {/* 量表题 */}
        {q.type === 'scale' && (
          <div style={styles.scaleContainer}>
            <div style={styles.scaleLabels}>
              <span>{q.scale_min_label}</span>
              <span>{q.scale_max_label}</span>
            </div>
            <div style={styles.scaleOptions}>
              {Array.from({ length: q.scale_max - q.scale_min + 1 }, (_, i) => q.scale_min + i).map((num) => (
                <label key={num} style={styles.scaleItem}>
                  <input
                    type="radio"
                    name={`q_${q.id}`}
                    checked={value === num}
                    onChange={() => updateAnswer(q.id, num)}
                    style={styles.scaleInput}
                  />
                  <span style={{
                    ...styles.scaleNumber,
                    ...(value === num ? styles.scaleNumberActive : {}),
                  }}>{num}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}></div>
        <p>加载中...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorIcon}>!</div>
        <h2>加载失败</h2>
        <p>{error}</p>
      </div>
    );
  }
  
  return (
    <div style={styles.container}>
      {/* 问卷头部 */}
      <div style={styles.header}>
        <h1 style={styles.title}>{title}</h1>
        {description && <p style={styles.description}>{description}</p>}
      </div>
      
      {/* 题目列表 */}
      <div style={styles.content}>
        {questions.map(renderQuestion)}
      </div>
      
      {/* 提交按钮 */}
      <div style={styles.footer}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            ...styles.submitBtn,
            ...(submitting ? styles.submitBtnDisabled : {}),
          }}
        >
          {submitting ? '提交中...' : '提交答卷'}
        </button>
        <p style={styles.footerHint}>提交后答卷不可修改</p>
      </div>
    </div>
  );
}

// 样式
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '16px 16px 100px',
    background: '#f5f5f5',
    minHeight: '100vh',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    color: '#666',
  },
  loadingSpinner: {
    width: 40,
    height: 40,
    border: '3px solid #e5e5e5',
    borderTopColor: '#4f46e5',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorContainer: {
    textAlign: 'center',
    padding: '100px 20px',
  },
  errorIcon: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    background: '#fee2e2',
    color: '#dc2626',
    fontSize: 28,
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  header: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    borderRadius: 12,
    padding: '32px 24px',
    color: '#fff',
    marginBottom: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 8,
    lineHeight: 1.3,
  },
  description: {
    fontSize: 14,
    opacity: 0.9,
    lineHeight: 1.6,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  questionCard: {
    background: '#fff',
    borderRadius: 10,
    padding: '20px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  questionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  questionNumber: {
    fontWeight: 700,
    color: '#4f46e5',
    marginRight: 8,
    fontSize: 16,
    minWidth: 24,
  },
  questionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },
  required: {
    color: '#dc2626',
    marginLeft: 4,
    fontSize: 16,
  },
  questionDesc: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
    marginLeft: 32,
  },
  fieldError: {
    fontSize: 13,
    color: '#dc2626',
    marginBottom: 8,
    marginLeft: 32,
  },
  optionsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginLeft: 32,
  },
  optionLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e5e5e5',
    transition: 'all 0.2s',
  },
  radioInput: {
    marginRight: 10,
    width: 18,
    height: 18,
    accentColor: '#4f46e5',
  },
  checkboxInput: {
    marginRight: 10,
    width: 18,
    height: 18,
    accentColor: '#4f46e5',
  },
  optionText: {
    fontSize: 15,
    color: '#333',
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid #e5e5e5',
    fontSize: 15,
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    marginLeft: 32,
  },
  scaleContainer: {
    marginLeft: 32,
  },
  scaleLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#888',
    marginBottom: 10,
  },
  scaleOptions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  scaleItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
  },
  scaleInput: {
    display: 'none',
  },
  scaleNumber: {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: '1px solid #e5e5e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 600,
    color: '#666',
    transition: 'all 0.2s',
  },
  scaleNumberActive: {
    background: '#4f46e5',
    borderColor: '#4f46e5',
    color: '#fff',
  },
  footer: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#fff',
    padding: '12px 16px',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
    zIndex: 100,
  },
  submitBtn: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  submitBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  footerHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },
};
