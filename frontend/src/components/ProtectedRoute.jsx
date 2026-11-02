import { Navigate } from "react-router-dom";
import { getToken, getUser, homeFor } from "../lib/auth";

const ProtectedRoute = ({ children, role }) => {
  const user = getUser();
  if (!user || !getToken()) {
    return <Navigate to="/login" replace />;
  }

  // If user has a different role, redirect to their appropriate dashboard
  if (user.role !== role) {
    return <Navigate to={homeFor(user)} replace />;
  }

  return children;
};

export default ProtectedRoute;
