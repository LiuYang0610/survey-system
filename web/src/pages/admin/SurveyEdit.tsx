import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSurveyDetail, createSurvey, updateSurvey, updateQuestions } from '../../lib/api';

interface Question {
  id?: string;
  sort_order: number;
  type: 'single' | 'multiple' | 'text' | 'scale';
  title: string;
  description: string;
  required: boolean;
  options: string[];
  scale_min: number;
  scale_max: number;
  scale_min_label: string;
  scale_max_label: string;
}

export default function SurveyEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  
  // 加载问卷数据（编辑模式）
  useEffect(() => {
    if (!id) return;
    
    async function load() {
      try {
        const data = await getSurveyDetail(id!);
        setTitle(data.title);
        setDescription(data.description || '');
        setQuestions(
          data.questions.map((q: any) => ({
            ...q,
            required: q.required === 1,
            options: Array.isArray(q.options) ? q.options : [],
          }))
        );
      } catch (err: any) {
        alert(err.message || '加载失败');
        navigate('/admin');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate]);
  
  // 添加题目
  const addQuestion = (type: Question['type']) => {
    const newQ: Question = {
      sort_order: questions.length + 1,
      type,
      title: '',
      description: '',
      required: false,
      options: type === 'single' || type === 'multiple' ? ['选项1', '选项2'] : [],
      scale_min: 1,
      scale_max: 5,
      scale_min_label: '非常不满意',
      scale_max_label: '非常满意',
    };
    setQuestions([...questions, newQ]);
  };
  
  // 更新题目
  const updateQuestion = (index: number, updates: Partial<Question>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setQuestions(newQuestions);
  };
  
  // 删除题目
  const removeQuestion = (index: number) => {
    if (!confirm('确定删除此题目？')) return;
    const newQuestions = questions.filter((_, i) => i !== index).map((q, i) => ({
      ...q,
      sort_order: i + 1,
    }));
    setQuestions(newQuestions);
  };
  
  // 移动题目
  const moveQuestion = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= questions.length) return;
    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
    setQuestions(newQuestions.map((q, i) => ({ ...q, sort_order: i + 1 })));
  };
  
  // 更新选项
  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const newQuestions = [...questions];
    const newOptions = [...newQuestions[qIndex].options];
    newOptions[oIndex] = value;
    newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions };
    setQuestions(newQuestions);
  };
  
  const addOption = (qIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex] = {
      ...newQuestions[qIndex],
      options: [...newQuestions[qIndex].options, `选项${newQuestions[qIndex].options.length + 1}`],
    };
    setQuestions(newQuestions);
  };
  
  const removeOption = (qIndex: number, oIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex] = {
      ...newQuestions[qIndex],
      options: newQuestions[qIndex].options.filter((_, i) => i !== oIndex),
    };
    setQuestions(newQuestions);
  };
  
  // 保存
  const handleSave = async () => {
    if (!title.trim()) {
      alert('请输入问卷标题');
      return;
    }
    
    // 校验题目
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].title.trim()) {
        alert(`第 ${i + 1} 题标题不能为空`);
        return;
      }
    }
    
    setSaving(true);
    try {
      if (isEdit) {
        await updateSurvey(id!, { title, description });
        await updateQuestions(id!, questions.map(q => ({
          ...q,
          required: q.required ? 1 : 0,
        })));
        alert('保存成功');
      } else {
        const data = await createSurvey({
          title,
          description,
          questions: questions.map(q => ({
            ...q,
            required: q.required ? 1 : 0,
          })),
        });
        alert(`问卷创建成功！访问链接：/s/${data.unique_key}`);
        navigate('/admin');
      }
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;
  }
  
  return (
    <div style={styles.container}>
      {/* 问卷基本信息 */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>问卷基本信息</h3>
        <div style={styles.field}>
          <label style={styles.label}>问卷标题 <span style={{ color: '#dc2626' }}>*</span></label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：客户满意度调查"
            style={styles.input}
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>问卷说明（可选）</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要说明问卷目的..."
            style={styles.textarea}
            rows={3}
          />
        </div>
      </div>
      
      {/* 题目列表 */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>题目列表 ({questions.length})</h3>
          <div style={styles.addBtnGroup}>
            <button onClick={() => addQuestion('single')} style={styles.addBtn}>+ 单选</button>
            <button onClick={() => addQuestion('multiple')} style={styles.addBtn}>+ 多选</button>
            <button onClick={() => addQuestion('text')} style={styles.addBtn}>+ 填空</button>
            <button onClick={() => addQuestion('scale')} style={styles.addBtn}>+ 量表</button>
          </div>
        </div>
        
        {questions.length === 0 ? (
          <div style={styles.emptyQuestions}>
            <p>暂无题目，请点击上方按钮添加</p>
          </div>
        ) : (
          questions.map((q, qIndex) => (
            <div key={qIndex} style={styles.questionCard}>
              <div style={styles.questionHeader}>
                <div style={styles.questionActions}>
                  <span style={styles.questionNum}>{q.sort_order}</span>
                  <button onClick={() => moveQuestion(qIndex, -1)} disabled={qIndex === 0} style={styles.moveBtn}>↑</button>
                  <button onClick={() => moveQuestion(qIndex, 1)} disabled={qIndex === questions.length - 1} style={styles.moveBtn}>↓</button>
                </div>
                <span style={{
                  ...styles.typeTag,
                  color: q.type === 'single' ? '#4f46e5' :
                         q.type === 'multiple' ? '#7c3aed' :
                         q.type === 'text' ? '#059669' : '#d97706',
                }}>
                  {q.type === 'single' ? '单选' :
                   q.type === 'multiple' ? '多选' :
                   q.type === 'text' ? '填空' : '量表'}
                </span>
                <label style={styles.requiredLabel}>
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(qIndex, { required: e.target.checked })}
                  />
                  必填
                </label>
                <button onClick={() => removeQuestion(qIndex)} style={styles.deleteBtn}>删除</button>
              </div>
              
              <div style={styles.questionBody}>
                <input
                  type="text"
                  value={q.title}
                  onChange={(e) => updateQuestion(qIndex, { title: e.target.value })}
                  placeholder="请输入题干..."
                  style={styles.questionInput}
                />
                
                {/* 选项编辑（单选/多选） */}
                {(q.type === 'single' || q.type === 'multiple') && (
                  <div style={styles.optionsEditor}>
                    {q.options.map((opt, oIndex) => (
                      <div key={oIndex} style={styles.optionRow}>
                        <span style={styles.optionIndex}>{oIndex + 1}.</span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                          style={styles.optionInput}
                        />
                        <button onClick={() => removeOption(qIndex, oIndex)} style={styles.removeOptionBtn}>×</button>
                      </div>
                    ))}
                    <button onClick={() => addOption(qIndex)} style={styles.addOptionBtn}>
                      + 添加选项
                    </button>
                  </div>
                )}
                
                {/* 量表设置 */}
                {q.type === 'scale' && (
                  <div style={styles.scaleSettings}>
                    <div style={styles.scaleRow}>
                      <label>最小值:</label>
                      <input type="number" value={q.scale_min} onChange={(e) => updateQuestion(qIndex, { scale_min: parseInt(e.target.value) || 1 })} style={styles.scaleInput} />
                      <label>最大值:</label>
                      <input type="number" value={q.scale_max} onChange={(e) => updateQuestion(qIndex, { scale_max: parseInt(e.target.value) || 5 })} style={styles.scaleInput} />
                    </div>
                    <div style={styles.scaleRow}>
                      <label>最低标签:</label>
                      <input type="text" value={q.scale_min_label} onChange={(e) => updateQuestion(qIndex, { scale_min_label: e.target.value })} style={styles.scaleTextInput} />
                      <label>最高标签:</label>
                      <input type="text" value={q.scale_max_label} onChange={(e) => updateQuestion(qIndex, { scale_max_label: e.target.value })} style={styles.scaleTextInput} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* 保存按钮 */}
      <div style={styles.saveBar}>
        <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving ? '保存中...' : isEdit ? '保存修改' : '创建问卷'}
        </button>
        <button onClick={() => navigate('/admin')} style={styles.cancelBtn}>
          取消
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: '0 auto',
  },
  section: {
    background: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 15,
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 14,
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none',
  },
  addBtnGroup: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  addBtn: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #4f46e5',
    background: '#fff',
    color: '#4f46e5',
    fontSize: 13,
    cursor: 'pointer',
  },
  emptyQuestions: {
    textAlign: 'center',
    padding: 40,
    color: '#888',
  },
  questionCard: {
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  questionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#fafafa',
    borderBottom: '1px solid #e5e5e5',
  },
  questionActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  questionNum: {
    fontWeight: 700,
    color: '#4f46e5',
    fontSize: 14,
    minWidth: 24,
  },
  moveBtn: {
    padding: '2px 6px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
    color: '#666',
  },
  typeTag: {
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    background: '#f0f0f0',
  },
  requiredLabel: {
    fontSize: 13,
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  deleteBtn: {
    padding: '4px 8px',
    border: 'none',
    background: 'transparent',
    color: '#dc2626',
    fontSize: 13,
    cursor: 'pointer',
  },
  questionBody: {
    padding: 14,
  },
  questionInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
    marginBottom: 12,
  },
  optionsEditor: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  optionIndex: {
    fontSize: 14,
    color: '#666',
    minWidth: 20,
  },
  optionInput: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
  },
  removeOptionBtn: {
    padding: '4px 8px',
    border: 'none',
    background: '#fee2e2',
    color: '#dc2626',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
  },
  addOptionBtn: {
    padding: '6px 12px',
    border: '1px dashed #ccc',
    background: 'transparent',
    borderRadius: 6,
    fontSize: 13,
    color: '#666',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  scaleSettings: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  scaleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
  },
  scaleInput: {
    width: 70,
    padding: '6px 8px',
    borderRadius: 4,
    border: '1px solid #ddd',
    fontSize: 13,
    textAlign: 'center',
  },
  scaleTextInput: {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 4,
    border: '1px solid #ddd',
    fontSize: 13,
  },
  saveBar: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    padding: '20px 0 40px',
  },
  saveBtn: {
    padding: '12px 32px',
    borderRadius: 8,
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '12px 32px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 15,
    cursor: 'pointer',
  },
};
