import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  LogOutIcon,
  VolumeOffIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { axiosInstance } from "../lib/axios";

const mouseClickSound = new Audio("/sounds/mouse-click.mp3");

function ProfileHeader() {
  const { logout, authUser, updateProfile, updateUsername } = useAuthStore();
  const { isSoundEnabled, toggleSound } = useChatStore();
  const [selectedImg, setSelectedImg] = useState(null);
  const [usernameInput, setUsernameInput] = useState(authUser?.username || "");
  const [usernameStatus, setUsernameStatus] = useState("unchecked");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const [checkedUsername, setCheckedUsername] = useState("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onloadend = async () => {
      const base64Image = reader.result;
      setSelectedImg(base64Image);
      await updateProfile({ profilePic: base64Image });
    };
  };

  useEffect(() => {
    setUsernameInput(authUser?.username || "");
    setUsernameStatus("unchecked");
    setUsernameMessage("");
    setUsernameSuggestions([]);
    setCheckedUsername("");
  }, [authUser?.username]);

  const handleUsernameChange = (value) => {
    setUsernameInput(value);
    setUsernameStatus("unchecked");
    setUsernameMessage("");
    setUsernameSuggestions([]);
    setCheckedUsername("");
  };

  const handleCheckUsername = async () => {
    const rawUsername = usernameInput?.trim();
    if (!rawUsername) {
      setUsernameStatus("error");
      setUsernameMessage("Username is required");
      setUsernameSuggestions([]);
      return;
    }
    setIsCheckingUsername(true);
    try {
      const res = await axiosInstance.get(
        `/auth/check-username?username=${encodeURIComponent(rawUsername)}`
      );
      if (res.data?.normalizedUsername) {
        const normalized = res.data.normalizedUsername;
        setUsernameInput(normalized);
        if (res.data.available) {
          setUsernameStatus("available");
          setUsernameMessage("This name is available.");
          setUsernameSuggestions([]);
          setCheckedUsername(normalized);
        } else {
          setUsernameStatus("taken");
          setUsernameMessage("This username is already taken.");
          setUsernameSuggestions(res.data?.suggestions || []);
          setCheckedUsername("");
        }
      } else {
        setUsernameStatus("error");
        setUsernameMessage("Unable to check username");
        setUsernameSuggestions([]);
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

  const handleSaveUsername = async () => {
    const trimmed = usernameInput.trim();
    if (
      usernameStatus !== "available" ||
      checkedUsername !== trimmed ||
      trimmed === authUser?.username
    ) {
      return;
    }
    setIsSavingUsername(true);
    const success = await updateUsername(trimmed);
    if (success) {
      setUsernameStatus("saved");
      setUsernameMessage("Username updated.");
      setUsernameSuggestions([]);
      setCheckedUsername(trimmed);
    }
    setIsSavingUsername(false);
  };

  return (
    <div className="p-6 border-b border-slate-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* AVATAR */}
          <div className="avatar avatar-online">
            <button
              className="size-14 rounded-full overflow-hidden relative group"
              onClick={() => fileInputRef.current.click()}
            >
              <img
                src={selectedImg || authUser.profilePic || "/avatar.png"}
                alt="User image"
                className="size-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-white text-xs">Change</span>
              </div>
            </button>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* USERNAME & ONLINE TEXT */}
          <div>
            <h3 className="text-slate-200 font-medium text-base max-w-45 truncate">
              {authUser.fullName}
            </h3>

            <p className="text-slate-400 text-xs">Online</p>
          </div>
        </div>

        {/* BUTTONS */}
        <div className="flex gap-4 items-center">
          {/* LOGOUT BTN */}
          <button
            className="text-slate-400 hover:text-slate-200 transition-colors"
            onClick={logout}
          >
            <LogOutIcon className="size-5" />
          </button>

          {/* SOUND TOGGLE BTN */}
          <button
            className="text-slate-400 hover:text-slate-200 transition-colors"
            onClick={() => {
              // play click sound before toggling
              mouseClickSound.currentTime = 0; // reset to start
              mouseClickSound
                .play()
                .catch((error) => console.log("Audio play failed:", error));
              toggleSound();
            }}
          >
            {isSoundEnabled ? (
              <Volume2Icon className="size-5" />
            ) : (
              <VolumeOffIcon className="size-5" />
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
        <label className="auth-input-label">Username</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => handleUsernameChange(e.target.value)}
            className="flex-1 input"
            placeholder="your_username"
          />
          <button
            type="button"
            onClick={handleCheckUsername}
            disabled={isCheckingUsername || !usernameInput.trim()}
            className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50"
          >
            {isCheckingUsername ? "Checking..." : "Check"}
          </button>
          <button
            type="button"
            onClick={handleSaveUsername}
            disabled={
              isSavingUsername ||
              usernameStatus !== "available" ||
              checkedUsername !== usernameInput.trim() ||
              usernameInput.trim() === authUser?.username
            }
            className="px-3 py-2 rounded-lg text-xs font-medium border border-emerald-500/60 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40"
          >
            {isSavingUsername ? "Saving..." : "Update"}
          </button>
          {usernameStatus === "available" || usernameStatus === "saved" ? (
            <CheckIcon className="size-4 text-emerald-300" />
          ) : null}
          {usernameStatus === "taken" || usernameStatus === "error" ? (
            <XIcon className="size-4 text-rose-300" />
          ) : null}
        </div>
        {usernameMessage ? (
          <p
            className={`mt-2 text-xs ${
              usernameStatus === "available" || usernameStatus === "saved"
                ? "text-emerald-300"
                : usernameStatus === "taken" || usernameStatus === "error"
                ? "text-rose-300"
                : "text-slate-400"
            }`}
          >
            {usernameMessage}
          </p>
        ) : null}
        {usernameStatus === "taken" && usernameSuggestions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {usernameSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleUsernameChange(suggestion)}
                className="text-xs text-cyan-200 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-1"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
export default ProfileHeader;
