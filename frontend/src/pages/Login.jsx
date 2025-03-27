import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Allapi from '../utils/common';

const Login = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      navigate(`/${userData.role}`);
    }
  }, [navigate]);

  const handleGoogleLogin = () => {
    console.log("google login api: ",Allapi.googleLogin.url)
    window.location.href = Allapi.googleLogin.url;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8 bg-gray-800 rounded-lg shadow-xl">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">Examify</h2>
          <p className="mt-2 text-sm text-gray-400">Sign in to your account</p>
        </div>
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all duration-300"
        >
          <img
            className="h-5 w-5 mr-2"
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt="Google logo"
          />
          Continue with Google
        </button>
      </div>
    </div>
  );
};

export default Login;