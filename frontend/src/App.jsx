import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import TeacherPanel from './pages/TeacherPanel';
import StudentPanel from './pages/StudentPanel';
import CreateExam from './pages/CreateExam';
import EditExam from './pages/EditExam';
import LiveExam from './pages/LiveExam';
import ProtectedRoute from './components/ProtectedRoute';
import GoogleCallback from './pages/GoogleCallback';

function App() {
  // Get user from localStorage
  const user = JSON.parse(localStorage.getItem('user'));

  // Helper function to redirect based on role
  const redirectBasedOnRole = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'teacher':
        return '/teacher';
      case 'student':
        return '/student';
      default:
        return '/login';
    }
  };

  return (
    <Router>
      <Toaster position="top-center" toastOptions={{
        style: {
          background: '#1f2937',
          color: '#fff',
        },
      }} />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/google/callback" element={<GoogleCallback />} />

        {/* Protected routes */}
        <Route path="/teacher" element={
          <ProtectedRoute role="teacher">
            <TeacherPanel />
          </ProtectedRoute>
        } />
        <Route path="/student" element={
          <ProtectedRoute role="student">
            <StudentPanel />
          </ProtectedRoute>
        } />
        <Route path="/create-exam" element={
          <ProtectedRoute role="teacher">
            <CreateExam />
          </ProtectedRoute>
        } />
        <Route path="/edit-exam/:id" element={
          <ProtectedRoute role="teacher">
            <EditExam />
          </ProtectedRoute>
        } />
        <Route path="/live-exam/:id" element={
          <ProtectedRoute role="teacher">
            <LiveExam />
          </ProtectedRoute>
        } />

        {/* Redirect root and unmatched routes */}
        <Route path="/" element={<Navigate to={redirectBasedOnRole()} replace />} />
        <Route path="*" element={<Navigate to={redirectBasedOnRole()} replace />} />
      </Routes>
    </Router>
  );
}

export default App;