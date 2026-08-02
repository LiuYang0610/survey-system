import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSurvey, getDraft, saveDraft, submitResponse, recordVisit, getUserUuid } from '../../lib/api';
import { deepDecodeUnicode } from '../../lib/utils';

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
  skip_logic?: {
    enabled: boolean;
    conditions: {
      id: string;
      trigger: 'option_selected' | 'option_not_selected' | 'text_not_empty' | 'text_empty' | 'scale_gte' | 'scale_lte';
      option_index?: number;
      scale_value?: number;
      action: 'skip_to' | 'end';
      target_question_index?: number;
    }[];
  };
}

interface Survey {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

export default function SurveyPage() {
  const { uniqueKey } = useParams<{ uniqueKey: string }>();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [completed, setCompleted] = useState(false);
  const startTime = useRef(Date.now());
  const [allVisible, setAllVisible] = useState<boolean[]>([]);

  // 计算所有题目的可见性
  const calculateVisibility = useCallback((currentAnswers: Record<string, any>, questions: Question[]): boolean[] => {
    const visible: boolean[] = new Array(questions.length).fill(true);
    const skipRanges: {start: number, end: number}[] = [];
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.skip_logic?.enabled || !q.skip_logic.conditions) continue;
      
      for (const condition of q.skip_logic.conditions) {
        if (condition.action !== 'skip_to' || !condition.target_question_index) continue;
        
        const answer = currentAnswers[q.id];
        let triggered = false;
        
        switch (condition.trigger) {
          case 'option_selected':
            if (q.type === 'single' && answer === condition.option_index) triggered = true;
            if (q.type === 'multiple' && Array.isArray(answer) && answer.includes(condition.option_index)) triggered = true;
            break;
          case 'option_not_selected':
            if (q.type === 'single' && (answer === undefined || answer !== condition.option_index)) triggered = true;
            if (q.type === 'multiple' && (!Array.isArray(answer) || !answer.includes(condition.option_index))) triggered = true;
            break;
          case 'text_not_empty':
            if (answer && String(answer).trim() !== '') triggered = true;
            break;
          case 'text_empty':
            if (!answer || String(answer).trim() === '') triggered = true;
            break;
          case 'scale_gte':
            if (answer !== undefined && Number(answer) >= (condition.scale_value || 0)) triggered = true;
            break;
          case 'scale_lte':
            if (answer !== undefined && Number(answer) <= (condition.scale_value || 0)) triggered = true;
            break;
        }
        
        if (triggered) {
          const targetIdx = condition.target_question_index - 1;
          skipRanges.push({ start: i + 1, end: Math.min(targetIdx, questions.length) });
        }
      }
    }
    
    // 应用跳过范围
    for (const range of skipRanges) {
      for (let i = range.start; i < range.end; i++) {
        visible[i] = false;
      }
    }
    
    return visible;
  }, []);

  // 检查是否有"结束问卷"的条件被触发
  const checkEndSurvey = useCallback((currentAnswers: Record<string, any>, questions: Question[]): boolean => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.skip_logic?.enabled || !q.skip_logic.conditions) continue;
      
      for (const condition of q.skip_logic.conditions) {
        if (condition.action !== 'end') continue;
        
        const answer = currentAnswers[q.id];
        let triggered = false;
        
        switch (condition.trigger) {
          case 'option_selected':
            if (q.type === 'single' && answer === condition.option_index) triggered = true;
            if (q.type === 'multiple' && Array.isArray(answer) && answer.includes(condition.option_index)) triggered = true;
            break;
          case 'option_not_selected':
            if (q.type === 'single' && (answer === undefined || answer !== condition.option_index)) triggered = true;
            if (q.type === 'multiple' && (!Array.isArray(answer) || !answer.includes(condition.option_index))) triggered = true;
            break;
          case 'text_not_empty':
            if (answer && String(answer).trim() !== '') triggered = true;
            break;
          case 'text_empty':
            if (!answer || String(answer).trim() === '') triggered = true;
            break;
          case 'scale_gte':
            if (answer !== undefined && Number(answer) >= (condition.scale_value || 0)) triggered = true;
            break;
          case 'scale_lte':
            if (answer !== undefined && Number(answer) <= (condition.scale_value || 0)) triggered = true;
            break;
        }
        
        if (triggered) return true;
      }
    }
    return false;
  }, []);

  // 加载问卷数据
  useEffect(() => {
    async function loadSurvey() {
      try {
        const rawData = await getSurvey(uniqueKey!);
        const data = deepDecodeUnicode(rawData);
        setSurvey(data);
        recordVisit(data.id, 'view');
        
        let savedAnswers: Record<string, any> = {};
        try {
          const draft = await getDraft(data.id);
          if (draft && draft.answers) {
            savedAnswers = draft.answers;
            setAnswers(savedAnswers);
          }
        } catch {}
        
        const visible = calculateVisibility(savedAnswers, data.questions);
        setAllVisible(visible);
        
        const firstVisibleIdx = visible.findIndex(v => v);
        setCurrentStep(firstVisibleIdx >= 0 ? firstVisibleIdx : 0);
        
        recordVisit(data.id, 'start');
      } catch (err: any) {
        alert(err.message || '加载问卷失败');
        navigate('/');
      } finally {
        setLoading(false);
      }
    }
    loadSurvey();
  }, [uniqueKey, navigate, calculateVisibility]);

  const updateAnswer = async (questionId: string, value: any) => {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    
    if (survey) {
      const visible = calculateVisibility(newAnswers, survey.questions);
      setAllVisible(visible);
      
      clearTimeout((window as any).draftTimer);
      (window as any).draftTimer = setTimeout(() => {
        saveDraft(survey.id, newAnswers).catch(() => {});
      }, 2000);
    }
  };

  const goToQuestion = (targetIndex: number) => {
    if (survey && allVisible[targetIndex]) {
      setCurrentStep(targetIndex);
      setErrors({});
    }
  };

  const validateCurrentQuestion = (): boolean => {
    if (!survey) return false;
    const q = survey.questions[currentStep];
    const answer = answers[q.id];
    
    if (q.required && (answer === undefined || answer === null || answer === '' || 
        (Array.isArray(answer) && answer.length === 0))) {
      setErrors({ [q.id]: '此题为必填项' });
      return false;
    }
    
    setErrors({});
    return true;
  };

  const getNextVisibleIndex = (fromIndex: number): number => {
    for (let i = fromIndex + 1; i < allVisible.length; i++) {
      if (allVisible[i]) return i;
    }
    return -1;
  };

  const getPrevVisibleIndex = (fromIndex: number): number => {
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (allVisible[i]) return i;
    }
    return -1;
  };

  const handleNext = () => {
    if (!validateCurrentQuestion()) return;
    if (!survey) return;
    
    if (checkEndSurvey(answers, survey.questions)) {
      handleSubmit();
      return;
    }
    
    const nextIdx = getNextVisibleIndex(currentStep);
    if (nextIdx >= 0) {
      setCurrentStep(nextIdx);
      setErrors({});
    } else {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    const prevIdx = getPrevVisibleIndex(currentStep);
    if (prevIdx >= 0) {
      setCurrentStep(prevIdx);
      setErrors({});
    }
  };

  const handleSubmit = async () => {
    if (!survey) return;
    
    for (let i = 0; i < survey.questions.length; i++) {
      if (!allVisible[i]) continue;
      const q = survey.questions[i];
      const answer = answers[q.id];
      if (q.required && (answer === undefined || answer === null || answer === '' ||
          (Array.isArray(answer) && answer.length === 0))) {
        alert(`请完成第 ${q.sort_order} 题：${q.title}`);
        setCurrentStep(i);
        setErrors({ [q.id]: '此题为必填项' });
        return;
      }
    }
    
    setSubmitting(true);
    try {
      await submitResponse(survey.id, answers, survey.unique_key);
      recordVisit(survey.id, 'submit');
      setCompleted(true);
    } catch (err: any) {
      alert(err.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={styles.loadingContainer}><div style={styles.loadingText}>加载中...</div></div>;
  }

  if (!survey) {
    return <div style={styles.loadingContainer}><div style={styles.loadingText}>问卷不存在或已关闭</div></div>;
  }

  if (completed) {
    return (
      <div style={styles.successContainer}>
        <div style={styles.successIcon}>✓</div>
        <h2 style={styles.successTitle}>提交成功</h2>
        <p style={styles.successText}>感谢您的参与！</p>
      </div>
    );
  }

  // 获取可见题目列表
  const visibleQuestions = survey.questions
    .map((q, idx) => ({ question: q, originalIndex: idx }))
    .filter(({ originalIndex }) => allVisible[originalIndex]);
  
  // 计算当前题目的顺序号（从1开始）
  const currentSequentialNum = visibleQuestions.findIndex(vq => vq.originalIndex === currentStep) + 1;
  const totalVisible = visibleQuestions.length;
  const progress = totalVisible > 0 ? (currentSequentialNum / totalVisible) * 100 : 0;
  const currentQuestion = survey.questions[currentStep];

  return (
    <div style={styles.container}>
      {/* 顶部导航栏 - 显示顺序题号 */}
      <div style={styles.topNav}>
        <div style={styles.navScroll}>
          {visibleQuestions.map(({ question: q, originalIndex }, seqIdx) => {
            const isCurrent = originalIndex === currentStep;
            const isAnswered = answers[q.id] !== undefined && answers[q.id] !== '' && 
                              !(Array.isArray(answers[q.id]) && answers[q.id].length === 0);
            
            return (
              <button
                key={originalIndex}
                onClick={() => goToQuestion(originalIndex)}
                style={{
                  ...styles.navItem,
                  ...(isCurrent ? styles.navItemActive : {}),
                  ...(isAnswered && !isCurrent ? styles.navItemAnswered : {}),
                }}
              >
                {seqIdx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* 进度条 */}
      <div style={styles.progressSection}>
        <div style={styles.progressBar}>
          <div style={{...styles.progressFill, width: `${progress}%`}}></div>
        </div>
        <div style={styles.progressText}>
          第 {currentSequentialNum} 题 / 共 {totalVisible} 题
          {currentQuestion.required === 1 && <span style={styles.requiredIndicator}> *必填</span>}
        </div>
      </div>

      {/* 题目内容 */}
      <div style={styles.questionCard}>
        <div style={styles.questionHeader}>
          <span style={styles.questionNumber}>第 {currentSequentialNum} 题</span>
          {currentQuestion.type === 'single' && <span style={styles.typeBadge}>单选</span>}
          {currentQuestion.type === 'multiple' && <span style={styles.typeBadge}>多选</span>}
          {currentQuestion.type === 'text' && <span style={styles.typeBadge}>填空</span>}
          {currentQuestion.type === 'scale' && <span style={styles.typeBadge}>量表</span>}
        </div>
        
        <h3 style={styles.questionTitle}>{currentQuestion.title}</h3>
        {currentQuestion.description && <p style={styles.questionDesc}>{currentQuestion.description}</p>}

        {currentQuestion.type === 'single' && (
          <div style={styles.optionsList}>
            {currentQuestion.options.map((opt, idx) => (
              <label key={idx} style={{
                ...styles.optionLabel,
                ...(answers[currentQuestion.id] === idx ? styles.optionLabelSelected : {}),
              }}>
                <input type="radio" name={currentQuestion.id} checked={answers[currentQuestion.id] === idx} onChange={() => updateAnswer(currentQuestion.id, idx)} style={styles.radioInput} />
                <span style={styles.optionText}>{String.fromCharCode(65 + idx)}. {opt}</span>
              </label>
            ))}
          </div>
        )}

        {currentQuestion.type === 'multiple' && (
          <div style={styles.optionsList}>
            {currentQuestion.options.map((opt, idx) => (
              <label key={idx} style={{
                ...styles.optionLabel,
                ...(Array.isArray(answers[currentQuestion.id]) && answers[currentQuestion.id].includes(idx) ? styles.optionLabelSelected : {}),
              }}>
                <input type="checkbox" checked={Array.isArray(answers[currentQuestion.id]) && answers[currentQuestion.id].includes(idx)} onChange={(e) => {
                  const current = Array.isArray(answers[currentQuestion.id]) ? answers[currentQuestion.id] : [];
                  const newValue = e.target.checked ? [...current, idx] : current.filter((i: number) => i !== idx);
                  updateAnswer(currentQuestion.id, newValue);
                }} style={styles.checkboxInput} />
                <span style={styles.optionText}>{String.fromCharCode(65 + idx)}. {opt}</span>
              </label>
            ))}
          </div>
        )}

        {currentQuestion.type === 'text' && (
          <textarea value={answers[currentQuestion.id] || ''} onChange={(e) => updateAnswer(currentQuestion.id, e.target.value)} style={styles.textInput} placeholder="请输入您的回答..." rows={4} />
        )}

        {currentQuestion.type === 'scale' && (
          <div style={styles.scaleContainer}>
            <div style={styles.scaleLabels}>
              <span>{currentQuestion.scale_min_label}</span>
              <span>{currentQuestion.scale_max_label}</span>
            </div>
            <div style={styles.scaleOptions}>
              {Array.from({length: currentQuestion.scale_max - currentQuestion.scale_min + 1}, (_, i) => currentQuestion.scale_min + i).map(value => (
                <label key={value} style={{
                  ...styles.scaleOption,
                  ...(answers[currentQuestion.id] === value ? styles.scaleOptionSelected : {}),
                }}>
                  <input type="radio" name={currentQuestion.id} checked={answers[currentQuestion.id] === value} onChange={() => updateAnswer(currentQuestion.id, value)} style={styles.radioInput} />
                  <span style={styles.scaleValue}>{value}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {errors[currentQuestion.id] && <div style={styles.errorText}>{errors[currentQuestion.id]}</div>}
      </div>

      {/* 底部按钮 */}
      <div style={styles.buttonGroup}>
        <button onClick={handlePrev} style={styles.prevBtn} disabled={getPrevVisibleIndex(currentStep) < 0}>上一题</button>
        {getNextVisibleIndex(currentStep) >= 0 ? (
          <button onClick={handleNext} style={styles.nextBtn}>下一题</button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting} style={styles.submitBtn}>{submitting ? '提交中...' : '提交问卷'}</button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 600, margin: '0 auto', padding: '20px', minHeight: '100vh', background: '#f5f5f5' },
  loadingContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
  loadingText: { fontSize: 16, color: '#666' },
  topNav: { position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  navScroll: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 },
  navItem: { minWidth: 36, height: 36, borderRadius: 8, border: '1px solid #e5e5e5', background: '#fff', color: '#666', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 },
  navItemActive: { background: '#4f46e5', color: '#fff', borderColor: '#4f46e5', fontWeight: 600 },
  navItemAnswered: { background: '#dcfce7', color: '#16a34a', borderColor: '#16a34a' },
  progressSection: { marginBottom: 20 },
  progressBar: { height: 4, background: '#e5e5e5', borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#4f46e5', transition: 'width 0.3s' },
  progressText: { textAlign: 'center', fontSize: 13, color: '#666' },
  requiredIndicator: { color: '#dc2626', fontWeight: 500 },
  questionCard: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  questionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  questionNumber: { fontSize: 13, color: '#4f46e5', fontWeight: 600 },
  typeBadge: { fontSize: 11, padding: '2px 8px', background: '#e0e7ff', color: '#4f46e5', borderRadius: 4, fontWeight: 500 },
  questionTitle: { fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 8, lineHeight: 1.5 },
  questionDesc: { fontSize: 14, color: '#666', marginBottom: 16 },
  optionsList: { display: 'flex', flexDirection: 'column', gap: 12 },
  optionLabel: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '2px solid #e5e5e5', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s' },
  optionLabelSelected: { borderColor: '#4f46e5', background: '#f0f0ff' },
  radioInput: { width: 18, height: 18, accentColor: '#4f46e5' },
  checkboxInput: { width: 18, height: 18, accentColor: '#4f46e5' },
  optionText: { fontSize: 15, color: '#333' },
  textInput: { width: '100%', padding: '14px 16px', borderRadius: 10, border: '2px solid #e5e5e5', fontSize: 15, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as any },
  scaleContainer: { padding: '16px 0' },
  scaleLabels: { display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13, color: '#666' },
  scaleOptions: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  scaleOption: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px', border: '2px solid #e5e5e5', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s' },
  scaleOptionSelected: { borderColor: '#4f46e5', background: '#f0f0ff' },
  scaleValue: { fontSize: 18, fontWeight: 600, color: '#4f46e5' },
  errorText: { color: '#dc2626', fontSize: 13, marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 },
  buttonGroup: { display: 'flex', gap: 12, marginTop: 24 },
  prevBtn: { flex: 1, padding: '14px', borderRadius: 10, border: '2px solid #e5e5e5', background: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  nextBtn: { flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  submitBtn: { flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  successContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center' },
  successIcon: { width: 80, height: 80, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  successTitle: { fontSize: 24, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 },
  successText: { fontSize: 16, color: '#666' },
};

