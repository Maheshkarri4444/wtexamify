import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="relative">
          <div className="absolute -inset-1 bg-blue-500/20 rounded-lg blur"></div>
          <div className="relative bg-gray-800 rounded-xl border-2 border-blue-500/20 p-8">
            <FileQuestion className="w-20 h-20 mx-auto text-blue-400 mb-6" />
            <h1 className="text-6xl font-bold text-white mb-4">404</h1>
            <h2 className="text-xl font-semibold text-white mb-4">Page Not Found</h2>
            <p className="text-gray-400 mb-8">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-3 text-blue-400 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-all duration-300 font-medium"
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;