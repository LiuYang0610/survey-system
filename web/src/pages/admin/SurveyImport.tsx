import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getImportPresign, uploadFile, parseImportFile, confirmImport } from '../../lib/api';

interface ParsedQuestion {
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

type Step = 'upload' | 'preview' | 'done';

export default function SurveyImport() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [importId, setImportId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  
  // 支持的文件类型
  const acceptedTypes = '.xlsx,.docx,.pdf';
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  // 选择文件
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    // 验证文件类型
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'docx', 'pdf'].includes(ext || '')) {
      setError('请上传 .xlsx / .docx / .pdf 格式的文件');
      return;
    }
    
    // 验证文件大小
    if (selectedFile.size > maxSize) {
      setError('文件大小不能超过 10MB');
      return;
    }
    
    setFile(selectedFile);
    setError('');
  };
  
  // 上传并解析
  const handleUploadAndParse = async () => {
    if (!file) return;
    
    setUploading(true);
    setError('');
    
    try {
      // 1. 获取预签名 URL
      const presignData = await getImportPresign(file.name, file.type);
      setImportId(presignData.import_id);
      
      // 2. 上传文件
      await uploadFile(presignData.import_id, file);
      setUploading(false);
      
      // 3. 解析文件
      setParsing(true);
      const parseData = await parseImportFile(presignData.import_id);
      setTitle(parseData.title);
      setQuestions(parseData.questions.map(q => ({
        ...q,
        required: q.required || false,
      })));
      setStep('preview');
    } catch (err: any) {
      setError(err.message || '上传解析失败');
    } finally {
      setUploading(false);
      setParsing(false);
    }
  };
  
  // 更新解析后的题目
  const updateQuestion = (index: number, updates: Partial<ParsedQuestion>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setQuestions(newQuestions);
  };
  
  // 删除题目
  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index).map((q, i) => ({
      ...q,
      sort_order: i + 1,
    })));
  };
  
  // 确认导入
  const handleConfirm = async () => {
    if (!title.trim()) {
      alert('请输入问卷标题');
      return;
    }
    
    setSaving(true);
    try {
      await confirmImport({
        import_id: importId,
        title,
        description,
        questions: questions.map(q => ({
          ...q,
          required: q.required ? 1 : 0,
        })),
      });
      setStep('done');
    } catch (err: any) {
      alert(err.message || '导入失败');
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <div style={styles.container}>
      {/* 步骤指示器 */}
      <div style={styles.steps}>
        <div style={{ ...styles.stepItem, ...(step === 'upload' ? styles.stepActive : {}) }}>
          <span style={styles.stepNumber}>1</span>
          <span>上传文件</span>
        </div>
        <div style={styles.stepLine}></div>
        <div style={{ ...styles.stepItem, ...(step === 'preview' ? styles.stepActive : {}) }}>
          <span style={styles.stepNumber}>2</span>
          <span>预览校对</span>
        </div>
        <div style={styles.stepLine}></div>
        <div style={{ ...styles.stepItem, ...(step === 'done' ? styles.stepActive : {}) }}>
          <span style={styles.stepNumber}>3</span>
          <span>完成</span>
        </div>
      </div>
      
      {/* 步骤 1：上传 */}
      {step === 'upload' && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>上传问卷文件</h3>
          <p style={styles.cardDesc}>
            支持 .xlsx / .docx / .pdf 格式，文件大小不超过 10MB
          </p>
          
          {error && <div style={styles.errorBox}>{error}</div>}
          
          <div style={styles.uploadArea}>
            <input
              type="file"
              accept={acceptedTypes}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="file-input"
            />
            <label htmlFor="file-input" style={styles.uploadLabel}>
              {file ? (
                <div>
                  <div style={styles.fileName}>{file.name}</div>
                  <div style={styles.fileSize}>
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              ) : (
                <div>
                  <div style={styles.uploadIcon}>📁</div>
                  <div>点击选择文件</div>
                  <div style={styles.uploadHint}>或拖拽文件到此处</div>
                </div>
              )}
            </label>
          </div>
          
          {/* 文件格式说明 */}
          <div style={styles.formatHelp}>
            <h4>文档格式要求：</h4>
            <ul style={styles.formatList}>
              <li>第一行 = 问卷名称</li>
              <li>题目格式：序号 + 题干，如：1、你的职业？</li>
              <li>题型标记：【单选】【多选】【填空】【量表】</li>
              <li>选项分行：A、xxx 或 1、xxx</li>
              <li>必填标识：标注【必填】</li>
            </ul>
          </div>
          
          <div style={styles.actions}>
            <button
              onClick={handleUploadAndParse}
              disabled={!file || uploading || parsing}
              style={{
                ...styles.primaryBtn,
                ...((!file || uploading || parsing) ? styles.btnDisabled : {}),
              }}
            >
              {uploading ? '上传中...' : parsing ? '解析中...' : '上传并解析'}
            </button>
          </div>
        </div>
      )}
      
      {/* 步骤 2：预览校对 */}
      {step === 'preview' && (
        <div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>问卷信息</h3>
            <div style={styles.field}>
              <label style={styles.label}>问卷标题 <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>问卷说明</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={styles.textarea}
                rows={2}
              />
            </div>
          </div>
          
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>
              解析结果 ({questions.length} 题)
              <span style={{ fontSize: 13, color: '#888', fontWeight: 400, marginLeft: 8 }}>
                请检查并修正识别有误的内容
              </span>
            </h3>
            
            {questions.map((q, index) => (
              <div key={index} style={styles.previewQuestion}>
                <div style={styles.previewHeader}>
                  <span style={styles.previewNum}>{index + 1}.</span>
                  <select
                    value={q.type}
                    onChange={(e) => updateQuestion(index, {
                      type: e.target.value as ParsedQuestion['type'],
                    })}
                    style={styles.typeSelect}
                  >
                    <option value="single">单选</option>
                    <option value="multiple">多选</option>
                    <option value="text">填空</option>
                    <option value="scale">量表</option>
                  </select>
                  <label style={styles.requiredLabel}>
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                    />
                    必填
                  </label>
                  <button onClick={() => removeQuestion(index)} style={styles.removeBtn}>删除</button>
                </div>
                <input
                  type="text"
                  value={q.title}
                  onChange={(e) => updateQuestion(index, { title: e.target.value })}
                  style={styles.questionInput}
                />
                {(q.type === 'single' || q.type === 'multiple') && q.options.length > 0 && (
                  <div style={styles.previewOptions}>
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} style={styles.previewOption}>
                        <span style={styles.optionPrefix}>
                          {q.type === 'single' ? '○' : '☐'}
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOptions = [...q.options];
                            newOptions[oIdx] = e.target.value;
                            updateQuestion(index, { options: newOptions });
                          }}
                          style={styles.optionEditInput}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'scale' && (
                  <div style={styles.scalePreview}>
                    {q.scale_min_label} ——— {Array.from({length: q.scale_max - q.scale_min + 1}, (_, i) => q.scale_min + i).join(' / ')} ——— {q.scale_max_label}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div style={styles.actions}>
            <button onClick={() => setStep('upload')} style={styles.secondaryBtn}>
              返回上传
            </button>
            <button onClick={handleConfirm} disabled={saving} style={styles.primaryBtn}>
              {saving ? '导入中...' : '确认导入'}
            </button>
          </div>
        </div>
      )}
      
      {/* 步骤 3：完成 */}
      {step === 'done' && (
        <div style={styles.card}>
          <div style={styles.doneContent}>
            <div style={styles.doneIcon}>✅</div>
            <h3 style={styles.doneTitle}>导入成功！</h3>
            <p style={styles.doneDesc}>问卷「{title}」已成功创建，共 {questions.length} 题</p>
            <div style={styles.actions}>
              <button onClick={() => navigate('/admin')} style={styles.primaryBtn}>
                返回问卷列表
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: '0 auto',
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    color: '#999',
  },
  stepActive: {
    color: '#4f46e5',
    fontWeight: 600,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
    background: '#e5e7eb',
    color: '#666',
  },
  stepLine: {
    width: 40,
    height: 1,
    background: '#ddd',
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 12,
    color: '#1a1a1a',
  },
  cardDesc: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  errorBox: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
  },
  uploadArea: {
    marginBottom: 16,
  },
  uploadLabel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    border: '2px dashed #ddd',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'border-color 0.2s',
  },
  uploadIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  uploadHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  fileName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#333',
  },
  fileSize: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  formatHelp: {
    background: '#f9fafb',
    borderRadius: 8,
    padding: '14px 16px',
    marginBottom: 16,
    fontSize: 13,
  },
  formatList: {
    paddingLeft: 20,
    color: '#555',
    lineHeight: 1.8,
  },
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    padding: '16px 0',
  },
  primaryBtn: {
    padding: '10px 24px',
    borderRadius: 8,
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '10px 24px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 14,
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  field: {
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none',
  },
  previewQuestion: {
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 10,
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  previewNum: {
    fontWeight: 700,
    color: '#4f46e5',
    minWidth: 24,
  },
  typeSelect: {
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid #ddd',
    fontSize: 13,
    outline: 'none',
  },
  requiredLabel: {
    fontSize: 13,
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  removeBtn: {
    marginLeft: 'auto',
    padding: '2px 8px',
    border: 'none',
    background: 'transparent',
    color: '#dc2626',
    fontSize: 13,
    cursor: 'pointer',
  },
  questionInput: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
  },
  previewOptions: {
    marginTop: 8,
    paddingLeft: 24,
  },
  previewOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  optionPrefix: {
    color: '#999',
    fontSize: 14,
  },
  optionEditInput: {
    flex: 1,
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid #eee',
    fontSize: 13,
    outline: 'none',
  },
  scalePreview: {
    marginTop: 8,
    paddingLeft: 24,
    fontSize: 13,
    color: '#888',
  },
  doneContent: {
    textAlign: 'center',
    padding: '20px 0',
  },
  doneIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8,
  },
  doneDesc: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
};
