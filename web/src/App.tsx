import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SurveyPage from './pages/survey/SurveyPage';
import SurveySuccess from './pages/survey/SurveySuccess';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import SurveyList from './pages/admin/SurveyList';
import SurveyEdit from './pages/admin/SurveyEdit';
import SurveyImport from './pages/admin/SurveyImport';
import SurveyStats from './pages/admin/SurveyStats';
import ResponseList from './pages/admin/ResponseList';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 前台填写端 */}
        <Route path="/s/:uniqueKey" element={<SurveyPage />} />
        <Route path="/s/:uniqueKey/success" element={<SurveySuccess />} />
        
        {/* 后台管理端 */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<SurveyList />} />
          <Route path="surveys" element={<SurveyList />} />
          <Route path="survey/new" element={<SurveyEdit />} />
          <Route path="survey/:id/edit" element={<SurveyEdit />} />
          <Route path="survey/:id/import" element={<SurveyImport />} />
          <Route path="survey/:id/stats" element={<SurveyStats />} />
          <Route path="survey/:id/responses" element={<ResponseList />} />
        </Route>
        
        {/* 默认路由 */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<div style={{ textAlign: 'center', padding: '100px 20px' }}><h1>404</h1><p>页面不存在</p></div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
