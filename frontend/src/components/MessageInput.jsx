import { useEffect, useRef, useState } from "react";
import useKeyboardSound from "../hooks/useKeyboardSound";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import { ImageIcon, SendIcon, XIcon } from "lucide-react";

function MessageInput() {
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const [text, setText] = useState("");
  const [imagePreviews, setImagePreviews] = useState([]);

  const fileInputRef = useRef(null);

  const {
    sendMessage,
    isSoundEnabled,
    emitTypingStart,
    emitTypingStop,
    replyToMessage,
    clearReplyToMessage,
    editingMessage,
    clearEditingMessage,
    updateMessage,
  } = useChatStore();
  const { selectedUser } = useChatStore();
  const typingStopTimerRef = useRef(null);
  const lastTypingEmitRef = useRef(0);
  const MAX_ATTACHMENTS = 4;

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
    if (editingMessage) {
      setText(editingMessage.text || "");
    }
  }, [editingMessage]);

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
    const available = MAX_ATTACHMENTS - imagePreviews.length;
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
      }));
      setImagePreviews((prev) => [...prev, ...previews]);
    } catch (error) {
      toast.error("Failed to process images");
      console.log(error);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!text.trim() && imagePreviews.length === 0) return;
    if (isSoundEnabled) playRandomKeyStrokeSound();

    if (editingMessage) {
      updateMessage(editingMessage._id, text.trim());
      clearEditingMessage();
    } else {
      sendMessage({
        text: text.trim(),
        images: imagePreviews.map((img) => img.dataUrl),
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
    }
    if (selectedUser?._id) {
      emitTypingStop(selectedUser._id);
    }
    setText("");
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImageChange = (e) => {
    if (!e.target.files?.length) return;
    addImages(e.target.files);
  };

  const removeImage = (id) => {
    setImagePreviews((prev) => prev.filter((img) => img.id !== id));
    if (fileInputRef.current && imagePreviews.length <= 1) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) {
      addImages(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="p-4 border-t border-slate-700/50"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {(editingMessage || replyToMessage || imagePreviews.length > 0) && (
        <div className="max-w-3xl mx-auto mb-3 grid grid-cols-4 gap-2">
          {editingMessage && (
            <div className="col-span-4 flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300">
              <span className="truncate">Editing message</span>
              <button
                type="button"
                onClick={() => {
                  clearEditingMessage();
                  setText("");
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          )}
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
          {imagePreviews.map((img) => (
            <div key={img.id} className="relative">
              <img
                src={img.dataUrl}
                alt="Preview"
                className="w-full h-20 object-cover rounded-lg border border-slate-700"
              />
              <button
                onClick={() => removeImage(img.id)}
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
            imagePreviews.length > 0 ? "text-cyan-500" : ""
          }`}
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button
          type="submit"
          disabled={!text.trim() && imagePreviews.length === 0}
          className="bg-linear-to-r from-cyan-500 to-cyan-600 text-white rounded-lg px-4 py-2 font-medium hover:from-cyan-600 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
export default MessageInput;
