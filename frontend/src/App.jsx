import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import { PageLoader } from './components/ui/Feedback';
import { getUser, homeFor } from './lib/auth';
import Login from './pages/Login';
import GoogleCallback from './pages/GoogleCallback';
import NotFound from './pages/NotFound';
import NotAllowed from './pages/NotAllowed';

// Teacher and student screens load on demand, so students never download the
// teacher tools (the Excel library alone is a third of the app).
const DevLogin = lazy(() => import('./pages/DevLogin'));
const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'));
const ExamWorkspace = lazy(() => import('./pages/teacher/ExamWorkspace'));
const OverviewTab = lazy(() => import('./pages/teacher/OverviewTab'));
const QuestionsTab = lazy(() => import('./pages/teacher/QuestionsTab'));
const SetsTab = lazy(() => import('./pages/teacher/SetsTab'));
const StudentsTab = lazy(() => import('./pages/teacher/StudentsTab'));
const SettingsTab = lazy(() => import('./pages/teacher/SettingsTab'));
const LiveTab = lazy(() => import('./pages/teacher/LiveTab'));
const ResultsTab = lazy(() => import('./pages/teacher/ResultsTab'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const ExamRoom = lazy(() => import('./pages/student/ExamRoom'));
const DemoExam = lazy(() => import('./pages/student/DemoExam'));

function App() {
  return (
    <Router>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          className: '!rounded-xl !border !border-line !bg-surface !text-ink !text-sm !shadow-pop',
        }}
      />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/google/callback" element={<GoogleCallback />} />
          <Route path="/not-allowed" element={<NotAllowed />} />
          {import.meta.env.DEV && <Route path="/dev" element={<DevLogin />} />}

          {/* Teacher */}
          <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/teacher/exams/:id" element={<ProtectedRoute role="teacher"><ExamWorkspace /></ProtectedRoute>}>
            <Route index element={<OverviewTab />} />
            <Route path="questions" element={<QuestionsTab />} />
            <Route path="sets" element={<SetsTab />} />
            <Route path="students" element={<StudentsTab />} />
            <Route path="settings" element={<SettingsTab />} />
            <Route path="live" element={<LiveTab />} />
            <Route path="results" element={<ResultsTab />} />
          </Route>

          {/* Student */}
          <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/exams/:id" element={<ProtectedRoute role="student"><ExamRoom /></ProtectedRoute>} />
          {/* Practice exams that never reach the server, open to anyone */}
          <Route path="/demo/:kind" element={<DemoExam />} />

          {/* Redirect root */}
          <Route path="/" element={<Navigate to={homeFor(getUser())} replace />} />

          {/* 404 route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
