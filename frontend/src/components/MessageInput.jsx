import { useCallback, useEffect, useRef, useState } from "react";
import useKeyboardSound from "../hooks/useKeyboardSound";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import {
  ImageIcon,
  SendIcon,
  XIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
} from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { shallow } from "zustand/shallow";

const MAX_ATTACHMENTS = 4;
const MAX_CONCURRENT_UPLOADS = 2;
const ATTACHMENTS_STORAGE_PREFIX = "chatify.attachmentsDraft";

const getDraftKey = (userId) =>
  `${ATTACHMENTS_STORAGE_PREFIX}.${userId || "unknown"}`;

const normalizeStoredAttachment = (item) => {
  if (!item?.dataUrl && !item?.url) return null;
  const status =
    item.status === "uploaded"
      ? "uploaded"
      : item.status === "failed"
      ? "failed"
      : "pending";
  return {
    id: item.id || `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl: item.dataUrl || item.url,
    status,
    progress: status === "uploaded" ? 100 : 0,
    url: item.url || null,
    publicId: item.publicId || null,
    error: item.error || null,
  };
};

function MessageInput() {
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);

  const fileInputRef = useRef(null);
  const uploadControllersRef = useRef(new Map());
  const activeUploadsRef = useRef(0);
  const scheduleUploadsRef = useRef(null);
  const attachmentsRef = useRef([]);
  const dragCounterRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);

  const {
    sendMessage,
    isSoundEnabled,
    emitTypingStart,
    emitTypingStop,
    replyToMessage,
    clearReplyToMessage,
    selectedUser,
  } = useChatStore(
    (state) => ({
      sendMessage: state.sendMessage,
      isSoundEnabled: state.isSoundEnabled,
      emitTypingStart: state.emitTypingStart,
      emitTypingStop: state.emitTypingStop,
      replyToMessage: state.replyToMessage,
      clearReplyToMessage: state.clearReplyToMessage,
      selectedUser: state.selectedUser,
    }),
    shallow
  );
  const typingStopTimerRef = useRef(null);
  const lastTypingEmitRef = useRef(0);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
      }
      if (selectedUser?._id) {
        emitTypingStop(selectedUser._id);
      }
    };
  }, [emitTypingStop, selectedUser?._id]);

  useEffect(() => {
    return () => {
      uploadControllersRef.current.forEach((controller) => controller.abort());
      uploadControllersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!selectedUser?._id) {
      setAttachments([]);
      return;
    }

    const raw = localStorage.getItem(getDraftKey(selectedUser._id));
    if (!raw) {
      setAttachments([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setAttachments([]);
        return;
      }
      const restored = parsed
        .map(normalizeStoredAttachment)
        .filter(Boolean);
      setAttachments(restored);
    } catch {
      setAttachments([]);
    }
  }, [selectedUser?._id]);

  const compressImage = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxSize = 1280;
          const scale = Math.min(
            1,
            maxSize / Math.max(img.width, img.height)
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(img.width * scale);
          canvas.height = Math.floor(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas not supported"));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const outputType =
            file.type === "image/png" ? "image/png" : "image/jpeg";
          const quality = outputType === "image/jpeg" ? 0.7 : undefined;
          const dataUrl = canvas.toDataURL(outputType, quality);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error("Image decode failed"));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    });

  const addImages = async (files) => {
    const available = MAX_ATTACHMENTS - attachments.length;
    if (available <= 0) {
      toast.error(`Max ${MAX_ATTACHMENTS} images per message`);
      return;
    }

    const selectedFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, available);

    if (selectedFiles.length === 0) {
      toast.error("Please select image files");
      return;
    }

    try {
      const compressed = await Promise.all(
        selectedFiles.map((file) => compressImage(file))
      );
      const previews = compressed.map((dataUrl) => ({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        dataUrl,
        status: "pending",
        progress: 0,
        url: null,
        publicId: null,
        error: null,
      }));
      setAttachments((prev) => [...prev, ...previews]);
    } catch (error) {
      toast.error("Failed to process images");
      console.log(error);
    }
  };

  const hasPendingUploads = attachments.some(
    (img) => img.status === "pending" || img.status === "uploading"
  );
  const hasFailedUploads = attachments.some((img) => img.status === "failed");
  const canSend =
    (text.trim() || attachments.length > 0) &&
    !hasPendingUploads &&
    !hasFailedUploads;

  const retryAttachment = (id) => {
    setAttachments((prev) =>
      prev.map((img) =>
        img.id === id
          ? { ...img, status: "pending", progress: 0, error: null }
          : img
      )
    );
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!canSend) return;
    if (isSoundEnabled) playRandomKeyStrokeSound();

    sendMessage({
      text: text.trim(),
      images: attachments
        .filter((img) => img.status === "uploaded")
        .map((img) => img.url),
      replyToMessageId: replyToMessage?._id,
      replyPreview: replyToMessage
        ? {
            _id: replyToMessage._id,
            senderId: replyToMessage.senderId,
            text: replyToMessage.text,
            image: replyToMessage.image,
            images: replyToMessage.images,
            deletedAt: replyToMessage.deletedAt,
          }
        : null,
    });
    clearReplyToMessage();
    if (selectedUser?._id) {
      emitTypingStop(selectedUser._id);
    }
    setText("");
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImageChange = (e) => {
    if (!e.target.files?.length) return;
    addImages(e.target.files);
  };

  const removeAttachment = async (id) => {
    const current = attachmentsRef.current.find((item) => item.id === id);
    if (!current) return;

    if (current.status === "uploading") {
      const controller = uploadControllersRef.current.get(id);
      if (controller) controller.abort();
      setAttachments((prev) => prev.filter((img) => img.id !== id));
      return;
    }

    if (current.status === "uploaded" && current.publicId) {
      try {
        await axiosInstance.delete("/messages/attachments", {
          data: { publicId: current.publicId },
        });
      } catch (error) {
        console.log("Failed to delete attachment:", error);
      }
    }

    setAttachments((prev) => prev.filter((img) => img.id !== id));
    if (fileInputRef.current && attachmentsRef.current.length <= 1) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    if (e.dataTransfer?.files?.length) {
      addImages(e.dataTransfer.files);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      setIsDragActive(false);
    }
  };

  const uploadAttachment = useCallback(async (attachment) => {
    const controller = new AbortController();
    uploadControllersRef.current.set(attachment.id, controller);
    setAttachments((prev) =>
      prev.map((img) =>
        img.id === attachment.id
          ? { ...img, status: "uploading", progress: 0, error: null }
          : img
      )
    );

    try {
      const res = await axiosInstance.post(
        "/messages/attachments",
        { image: attachment.dataUrl },
        {
          signal: controller.signal,
          onUploadProgress: (event) => {
            if (!event.total) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            setAttachments((prev) =>
              prev.map((img) =>
                img.id === attachment.id
                  ? { ...img, progress: percent }
                  : img
              )
            );
          },
        }
      );

      setAttachments((prev) =>
        prev.map((img) =>
          img.id === attachment.id
            ? {
                ...img,
                status: "uploaded",
                progress: 100,
                url: res.data?.url || img.url,
                publicId: res.data?.publicId || img.publicId,
              }
            : img
        )
      );
    } catch (error) {
      if (error?.code === "ERR_CANCELED") {
        return;
      }
      setAttachments((prev) =>
        prev.map((img) =>
          img.id === attachment.id
            ? { ...img, status: "failed", error: "Upload failed" }
            : img
        )
      );
    } finally {
      uploadControllersRef.current.delete(attachment.id);
    }
  }, []);

  const scheduleUploads = useCallback(() => {
    if (activeUploadsRef.current >= MAX_CONCURRENT_UPLOADS) return;
    const pending = attachmentsRef.current.filter(
      (img) => img.status === "pending"
    );
    if (pending.length === 0) return;

    const availableSlots =
      MAX_CONCURRENT_UPLOADS - activeUploadsRef.current;
    pending.slice(0, availableSlots).forEach((attachment) => {
      activeUploadsRef.current += 1;
      uploadAttachment(attachment).finally(() => {
        activeUploadsRef.current -= 1;
        scheduleUploadsRef.current?.();
      });
    });
  }, [uploadAttachment]);

  useEffect(() => {
    scheduleUploadsRef.current = scheduleUploads;
  }, [scheduleUploads]);

  useEffect(() => {
    attachmentsRef.current = attachments;
    scheduleUploads();
  }, [attachments, scheduleUploads]);

  useEffect(() => {
    if (!selectedUser?._id) return;
    const key = getDraftKey(selectedUser._id);
    const uploaded = attachments.filter((item) => item.status === "uploaded");
    if (uploaded.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    const payload = uploaded.map((item) => ({
      id: item.id,
      status: "uploaded",
      url: item.url,
      publicId: item.publicId,
    }));
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      console.log("Failed to persist attachment drafts:", error);
      localStorage.removeItem(key);
    }
  }, [attachments, selectedUser?._id]);

  return (
    <div
      className="relative p-4 border-t border-slate-700/50"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {isDragActive && (
        <div className="absolute inset-2 z-10 rounded-xl border-2 border-dashed border-cyan-400/80 bg-slate-900/70 flex items-center justify-center text-cyan-100 text-sm font-medium">
          Drop images to attach
        </div>
      )}
      {(replyToMessage || attachments.length > 0) && (
        <div className="max-w-3xl mx-auto mb-3 grid grid-cols-4 gap-2">
          {replyToMessage && (
            <div className="col-span-4 flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300">
              <span className="truncate">
                Replying to:{" "}
                {replyToMessage.deletedAt
                  ? "Message deleted"
                  : replyToMessage.text || "Image"}
              </span>
              <button
                type="button"
                onClick={clearReplyToMessage}
                className="text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          )}
          {attachments.map((img) => (
            <div key={img.id} className="relative">
              <img
                src={img.dataUrl || img.url}
                alt="Preview"
                className="w-full h-20 object-cover rounded-lg border border-slate-700"
              />
              {img.status === "uploading" || img.status === "pending" ? (
                <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center rounded-lg">
                  <div className="w-10/12 h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all"
                      style={{ width: `${img.progress}%` }}
                    />
                  </div>
                  <span className="mt-2 text-xs text-slate-200">
                    {img.status === "pending" ? "Queued" : `${img.progress}%`}
                  </span>
                </div>
              ) : null}
              {img.status === "failed" ? (
                <div className="absolute inset-0 bg-slate-900/70 flex flex-col items-center justify-center rounded-lg text-rose-300 text-xs">
                  <AlertTriangleIcon className="w-4 h-4 mb-1" />
                  <span>Upload failed</span>
                  <button
                    type="button"
                    onClick={() => retryAttachment(img.id)}
                    className="mt-2 px-2 py-1 rounded-md bg-rose-500/20 text-rose-200 text-[10px] hover:bg-rose-500/30"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
              {img.status === "uploaded" ? (
                <div className="absolute top-1 left-1 bg-slate-900/70 rounded-full p-1">
                  <CheckCircle2Icon className="w-4 h-4 text-emerald-400" />
                </div>
              ) : null}
              <button
                onClick={() => removeAttachment(img.id)}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700"
                type="button"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSendMessage}
        className="max-w-3xl mx-auto flex space-x-4"
      >
        <input
          id="chat-message-input"
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            isSoundEnabled && playRandomKeyStrokeSound();
            if (!selectedUser?._id) return;

            const now = Date.now();
            if (now - lastTypingEmitRef.current > 1200) {
              emitTypingStart(selectedUser._id);
              lastTypingEmitRef.current = now;
            }

            if (typingStopTimerRef.current) {
              clearTimeout(typingStopTimerRef.current);
            }
            typingStopTimerRef.current = setTimeout(() => {
              emitTypingStop(selectedUser._id);
            }, 2000);
          }}
          className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg py-2 px-4"
          placeholder="Type your message..."
        />

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          multiple
          onChange={handleImageChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-4 transition-colors ${
            attachments.length > 0 ? "text-cyan-500" : ""
          }`}
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button
          type="submit"
          disabled={!canSend}
          className="bg-linear-to-r from-cyan-500 to-cyan-600 text-white rounded-lg px-4 py-2 font-medium hover:from-cyan-600 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
export default MessageInput;
