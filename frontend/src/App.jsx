import { useEffect } from "react";
import ChatPage from "./pages/ChatPage";
import SignUpPage from "./pages/SignUpPage";
import { useAuthStore } from "./store/useAuthStore";
import { Navigate, Route, Routes } from "react-router";
import LoginPage from "./pages/LoginPage";
import PageLoader from "./components/PageLoader";
import { Toaster } from "react-hot-toast";
function App() {
  const { checkAuth, isCheckingAuth, authUser } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
  if (isCheckingAuth) return <PageLoader />;
  return (
    <div className="min-h-screen app-shell relative flex items-center justify-center p-4 overflow-hidden">
      {/* DECORATORS - GRID BG & GLOW SHAPES */}
      <div className="absolute inset-0 app-grid bg-size-[14px_24px]" />
      <div className="absolute top-0 -left-4 size-72 app-glow-1 blur-[70px]" />
      <div className="absolute bottom-0 -right-4 size-72 app-glow-2 blur-[70px]" />

      <Routes>
        <Route
          path="/"
          element={authUser ? <ChatPage /> : <Navigate to={"/login"} />}
        />
        <Route
          path="/login"
          element={!authUser ? <LoginPage /> : <Navigate to={"/"} />}
        />
        <Route
          path="/signup"
          element={!authUser ? <SignUpPage /> : <Navigate to={"/"} />}
        />
      </Routes>

      <Toaster />
    </div>
  );
}

export default App;
