import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import BorderAnimatedContainer from "../components/BorderAnimatedContainer";
import {
  MessageCircleIcon,
  LockIcon,
  MailIcon,
  UserIcon,
  LoaderIcon,
  CheckCircle2Icon,
} from "lucide-react";
import { Link } from "react-router";
import { axiosInstance } from "../lib/axios";

const MAX_AUTO_USERNAME_ATTEMPTS = 5;

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
  const initialUsernameRef = useRef(formData.username);
  const autoCheckStartedRef = useRef(false);
  const latestUsernameCheckIdRef = useRef(0);
  const hasUserEditedUsernameRef = useRef(false);

  const resetUsernameVerification = useCallback(() => {
    setUsernameStatus("unchecked");
    setUsernameMessage("");
    setUsernameSuggestions([]);
    setCheckedUsername("");
  }, []);

  const checkUsernameAvailability = useCallback(async (rawUsername) => {
    const trimmedUsername = rawUsername?.trim();
    if (!trimmedUsername) {
      setUsernameStatus("error");
      setUsernameMessage("Username is required");
      setUsernameSuggestions([]);
      setCheckedUsername("");
      return { status: "error" };
    }

    const requestId = ++latestUsernameCheckIdRef.current;
    setIsCheckingUsername(true);

    try {
      const res = await axiosInstance.get(
        `/auth/check-username?username=${encodeURIComponent(trimmedUsername)}`
      );
      if (requestId !== latestUsernameCheckIdRef.current) {
        return { status: "stale" };
      }

      const normalizedUsername = res.data?.normalizedUsername || trimmedUsername;
      setFormData((prev) =>
        prev.username === normalizedUsername
          ? prev
          : { ...prev, username: normalizedUsername }
      );

      if (res.data?.available) {
        setUsernameStatus("available");
        setUsernameMessage("");
        setUsernameSuggestions([]);
        setCheckedUsername(normalizedUsername);
        return { status: "available", normalizedUsername };
      }

      setUsernameStatus("taken");
      setUsernameMessage("This username is already taken.");
      setUsernameSuggestions(res.data?.suggestions || []);
      setCheckedUsername("");
      return { status: "taken", normalizedUsername };
    } catch (error) {
      if (requestId !== latestUsernameCheckIdRef.current) {
        return { status: "stale" };
      }

      setUsernameStatus("error");
      setUsernameMessage(
        error.response?.data?.message || "Unable to check username"
      );
      setUsernameSuggestions([]);
      setCheckedUsername("");
      return { status: "error" };
    } finally {
      if (requestId === latestUsernameCheckIdRef.current) {
        setIsCheckingUsername(false);
      }
    }
  }, []);

  useEffect(() => {
    if (autoCheckStartedRef.current) return;
    autoCheckStartedRef.current = true;

    let cancelled = false;

    const autoCheckGeneratedUsername = async () => {
      let candidate = initialUsernameRef.current;

      for (let attempt = 0; attempt < MAX_AUTO_USERNAME_ATTEMPTS; attempt += 1) {
        if (cancelled || hasUserEditedUsernameRef.current) return;

        const result = await checkUsernameAvailability(candidate);
        if (cancelled || hasUserEditedUsernameRef.current) return;

        if (result.status === "available") {
          return;
        }

        if (result.status === "error" || result.status === "stale") {
          resetUsernameVerification();
          return;
        }

        if (attempt === MAX_AUTO_USERNAME_ATTEMPTS - 1) {
          const fallbackUsername = createDefaultUsername();
          setFormData((prev) => ({ ...prev, username: fallbackUsername }));
          resetUsernameVerification();
          return;
        }

        candidate = createDefaultUsername();
        setFormData((prev) => ({ ...prev, username: candidate }));
        resetUsernameVerification();
      }
    };

    autoCheckGeneratedUsername();

    return () => {
      cancelled = true;
      autoCheckStartedRef.current = false;
      latestUsernameCheckIdRef.current += 1;
    };
  }, [checkUsernameAvailability, resetUsernameVerification]);

  const handleUsernameChange = (value) => {
    hasUserEditedUsernameRef.current = true;
    latestUsernameCheckIdRef.current += 1;
    setIsCheckingUsername(false);
    setFormData((prev) => ({ ...prev, username: value }));
    resetUsernameVerification();
  };

  const handleCheckUsername = async () => {
    const result = await checkUsernameAvailability(formData.username);
    if (result.status !== "available") {
      return;
    }
  };

  const trimmedUsername = formData.username?.trim() || "";
  const isUsernameVerified =
    usernameStatus === "available" && checkedUsername === trimmedUsername;
  const showUsernameCheckHint =
    !isSigningUp &&
    !isCheckingUsername &&
    Boolean(trimmedUsername) &&
    usernameStatus === "unchecked" &&
    checkedUsername !== trimmedUsername;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSigningUp || !isUsernameVerified) return;
    signup(formData);
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
                          disabled={isCheckingUsername || !trimmedUsername}
                          className="accent-bg rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 accent-ring disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isCheckingUsername ? "Checking..." : "Check"}
                        </button>
                        {usernameStatus === "available" ? (
                          <div className="flex items-center gap-1 bg-transparent text-sm font-medium text-emerald-400">
                            <CheckCircle2Icon className="w-4 h-4 text-emerald-400" />
                            <span>Available</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {(usernameStatus === "taken" || usernameStatus === "error") &&
                    usernameMessage ? (
                      <p
                        className={`text-sm mt-2 ${
                          usernameStatus === "taken" || usernameStatus === "error"
                            ? "status-danger"
                            : "text-slate-400"
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
                  <div>
                    <button
                      className="auth-btn"
                      type="submit"
                      disabled={isSigningUp || !isUsernameVerified}
                    >
                      {isSigningUp ? (
                        <LoaderIcon className="w-full h-5 animate-spin text-center" />
                      ) : (
                        "Create Account"
                      )}
                    </button>
                    {showUsernameCheckHint ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Check username to continue.
                      </p>
                    ) : null}
                  </div>
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
