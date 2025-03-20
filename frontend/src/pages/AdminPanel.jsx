import { useNavigate } from 'react-router-dom';

const AdminPanel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <button
            onClick={() => {
              localStorage.clear();
              navigate('/login');
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Logout
          </button>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-gray-600">Welcome to the Admin Panel</p>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;