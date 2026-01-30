import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import BorderAnimatedContainer from "../components/BorderAnimatedContainer";
import {
  MessageCircleIcon,
  LockIcon,
  MailIcon,
  UserIcon,
  LoaderIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";
import { Link } from "react-router";
import { axiosInstance } from "../lib/axios";

const createDefaultUsername = () =>
  `user_${Math.floor(1000 + Math.random() * 9000)}`;

function SignUpPage() {
  const [formData, setFormData] = useState(() => ({
    fullName: "",
    email: "",
    password: "",
    username: createDefaultUsername(),
  }));
  const [usernameStatus, setUsernameStatus] = useState("unchecked");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const [checkedUsername, setCheckedUsername] = useState("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const { signup, isSigningUp } = useAuthStore();

  const handleSubmit = (e) => {
    e.preventDefault();
    signup(formData);
  };

  const handleUsernameChange = (value) => {
    setFormData({ ...formData, username: value });
    setUsernameStatus("unchecked");
    setUsernameMessage("");
    setUsernameSuggestions([]);
    setCheckedUsername("");
  };

  const handleCheckUsername = async () => {
    const rawUsername = formData.username?.trim();
    if (!rawUsername) {
      setUsernameStatus("error");
      setUsernameMessage("Username is required");
      setUsernameSuggestions([]);
      return;
    }

    try {
      setIsCheckingUsername(true);
      const res = await axiosInstance.get(
        `/auth/check-username?username=${encodeURIComponent(rawUsername)}`
      );

      if (res.data?.normalizedUsername) {
        setFormData((prev) => ({
          ...prev,
          username: res.data.normalizedUsername,
        }));
      }

      if (res.data?.available) {
        setUsernameStatus("available");
        setUsernameMessage("This name is available.");
        setUsernameSuggestions([]);
        setCheckedUsername(res.data.normalizedUsername || rawUsername);
      } else {
        setUsernameStatus("taken");
        setUsernameMessage("This username is already taken.");
        setUsernameSuggestions(res.data?.suggestions || []);
        setCheckedUsername("");
      }
    } catch (error) {
      setUsernameStatus("error");
      setUsernameMessage(
        error.response?.data?.message || "Unable to check username"
      );
      setUsernameSuggestions([]);
      setCheckedUsername("");
    } finally {
      setIsCheckingUsername(false);
    }
  };

  return (
    <div className="w-full flex items-center justify-center p-4 bg-slate-900">
      <div className="relative w-full max-w-6xl md:h-200 h-162.5">
        <BorderAnimatedContainer>
          <div className="w-full flex flex-col md:flex-row">
            {/* FORM CLOUMN - LEFT SIDE */}
            <div className="md:w-1/2 p-8 flex items-center justify-center md:border-r border-slate-600/30">
              <div className="w-full max-w-md">
                {/* HEADING TEXT */}
                <div className="text-center mb-8">
                  <MessageCircleIcon className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  <h2 className="text-2xl font-bold text-slate-200 mb-2">
                    Create Account
                  </h2>
                  <p className="text-slate-400">Sign up for a new account</p>
                </div>

                {/* FORM */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* FULL NAME */}
                  <div>
                    <label className="auth-input-label">Full Name</label>
                    <div className="relative">
                      <UserIcon className="auth-input-icon" />

                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={(e) =>
                          setFormData({ ...formData, fullName: e.target.value })
                        }
                        className="input"
                        placeholder="John Doe"
                      />
                    </div>
                  </div>

                  {/* USERNAME */}
                  <div>
                    <label className="auth-input-label">
                      Username
                      <span className="block text-xs text-slate-400 font-normal mt-1">
                        This should be unique and can be used to identify you.
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <UserIcon className="auth-input-icon" />

                        <input
                          type="text"
                          value={formData.username}
                          onChange={(e) => handleUsernameChange(e.target.value)}
                          className="input"
                          placeholder="user_1234"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCheckUsername}
                          disabled={
                            isCheckingUsername || !formData.username?.trim()
                          }
                          className="accent-bg rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 accent-ring disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isCheckingUsername ? "Checking..." : "Check"}
                        </button>
                        {usernameStatus === "available" ? (
                          <CheckCircle2Icon className="w-5 h-5 status-success" />
                        ) : null}
                        {usernameStatus === "taken" ||
                        usernameStatus === "error" ? (
                          <XCircleIcon className="w-5 h-5 status-danger" />
                        ) : null}
                      </div>
                    </div>

                    {usernameMessage ? (
                      <p
                        className={`text-sm mt-2 ${
                          usernameStatus === "available"
                            ? "status-success"
                            : "status-danger"
                        }`}
                      >
                        {usernameMessage}
                      </p>
                    ) : null}

                    {usernameStatus === "taken" &&
                    usernameSuggestions.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {usernameSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => handleUsernameChange(suggestion)}
                            className="auth-badge text-xs"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* EMAIL INPUT */}
                  <div>
                    <label className="auth-input-label">Email</label>
                    <div className="relative">
                      <MailIcon className="auth-input-icon" />

                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="input"
                        placeholder="johndoe@gmail.com"
                      />
                    </div>
                  </div>

                  {/* PASSWORD INPUT */}
                  <div>
                    <label className="auth-input-label">Password</label>
                    <div className="relative">
                      <LockIcon className="auth-input-icon" />

                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        className="input"
                        placeholder="Enter your password"
                      />
                    </div>
                  </div>

                  {/* SUBMIT BUTTON */}
                  <button
                    className="auth-btn"
                    type="submit"
                    disabled={
                      isSigningUp ||
                      usernameStatus !== "available" ||
                      checkedUsername !== formData.username?.trim()
                    }
                  >
                    {isSigningUp ? (
                      <LoaderIcon className="w-full h-5 animate-spin text-center" />
                    ) : (
                      "Create Account"
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <Link to="/login" className="auth-link">
                    Already have an account? Login
                  </Link>
                </div>
              </div>
            </div>

            {/* FORM ILLUSTRATION - RIGHT SIDE */}
            <div className="hidden md:w-1/2 md:flex items-center justify-center p-6 bg-linear-to-bl from-slate-800/20 to-transparent">
              <div>
                <img
                  src="/signup.png"
                  alt="People using mobile devices"
                  className="w-full h-auto object-contain"
                />
                <div className="mt-6 text-center">
                  <h3 className="text-xl font-medium accent-text-strong">
                    Start Your Journey Today
                  </h3>

                  <div className="mt-4 flex justify-center gap-4">
                    <span className="auth-badge">Free</span>
                    <span className="auth-badge">Easy Setup</span>
                    <span className="auth-badge">Private</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BorderAnimatedContainer>
      </div>
    </div>
  );
}
export default SignUpPage;
