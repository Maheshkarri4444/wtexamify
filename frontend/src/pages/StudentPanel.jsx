import { useNavigate } from 'react-router-dom';

const StudentPanel = () => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-white">Student Dashboard</h1>
          <button
            onClick={() => {
              localStorage.clear();
              navigate('/login');
            }}
            className="px-4 py-2 text-sm font-medium text-red-400 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-all duration-300"
          >
            Logout
          </button>
        </div>
        <div className="bg-gray-800 rounded-lg shadow-md p-6 border-2 border-blue-500/20">
          <p className="text-gray-400">Student features coming soon...</p>
        </div>
      </div>
    </div>
  );
};

export default StudentPanel;