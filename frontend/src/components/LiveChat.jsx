/**
 * LiveChat.jsx — Session-specific chat for live rooms.
 * Uses socket events: live:join, live:send, live:typing, live:message, live:history
 * Messages are isolated per session and auto-deleted 12h after session ends.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { getSharedSocket } from "../hooks/useSocket";

const ROLE_COLOR = { admin: "#f59e0b", trainer: "#a78bfa", user: "#e5e7eb" };
const ROLE_BADGE = { admin: "👑", trainer: "🎓", user: "" };

export default function LiveChat({ sessionId, onUnread }) {
  const { token, user } = useAuth();
  const [messages,  setMessages]  = useState([]);
  const [text,      setText]      = useState("");
  const [typers,    setTypers]    = useState({});
  const [connected, setConnected] = useState(false);
  const bottomRef    = useRef(null);
  const typingTimer  = useRef(null);
  const socketRef    = useRef(null);
  const typerTimers  = useRef({});
  const myPhone      = user?.phone;

  useEffect(() => {
    if (!token || !sessionId) return;

    const socket = getSharedSocket(token);
    socketRef.current = socket;
    setConnected(socket.connected);

    const onConnect = () => {
      setConnected(true);
      socket.emit("live:join", { sessionId });
    };
    const onDisconnect = () => setConnected(false);

    const onHistory = ({ messages: msgs }) => setMessages(msgs || []);

    const onMessage = ({ message }) => {
      if (!message) return;
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
      if (message.from !== myPhone) onUnread?.();
    };

    const onTyping = ({ from, fromName, isTyping }) => {
      if (from === myPhone) return;
      setTypers(prev => {
        const next = { ...prev };
        if (isTyping) {
          next[from] = fromName;
          clearTimeout(typerTimers.current[from]);
          typerTimers.current[from] = setTimeout(() => {
            setTypers(p => { const n = { ...p }; delete n[from]; return n; });
          }, 3000);
        } else {
          delete next[from];
        }
        return next;
      });
    };

    socket.on("connect",      onConnect);
    socket.on("disconnect",   onDisconnect);
    socket.on("live:history", onHistory);
    socket.on("live:message", onMessage);
    socket.on("live:typing",  onTyping);

    // Join immediately if already connected
    if (socket.connected) {
      socket.emit("live:join", { sessionId });
    }

    return () => {
      socket.off("connect",      onConnect);
      socket.off("disconnect",   onDisconnect);
      socket.off("live:history", onHistory);
      socket.off("live:message", onMessage);
      socket.off("live:typing",  onTyping);
      clearTimeout(typingTimer.current);
      Object.values(typerTimers.current).forEach(clearTimeout);
    };
  }, [token, sessionId, myPhone]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typers]);

  const sendMessage = useCallback(() => {
    if (!text.trim() || !socketRef.current || !connected) return;
    socketRef.current.emit("live:send", { sessionId, text: text.trim() });
    socketRef.current.emit("live:typing", { sessionId, isTyping: false });
    setText("");
    clearTimeout(typingTimer.current);
  }, [text, sessionId, connected]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (socketRef.current && connected) {
      socketRef.current.emit("live:typing", { sessionId, isTyping: true });
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        socketRef.current?.emit("live:typing", { sessionId, isTyping: false });
      }, 1500);
    }
  };

  const typerList = Object.values(typers);

  // Group consecutive messages from same sender
  const grouped = messages.map((msg, i) => ({
    ...msg,
    showHeader: i === 0 || messages[i - 1].from !== msg.from,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "0.5rem 0.75rem",
        display: "flex", flexDirection: "column", gap: "0.25rem",
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#55557a", fontSize: "0.78rem", padding: "1.5rem 0" }}>
            No messages yet. Say something! 👋
          </div>
        )}

        {grouped.map(msg => {
          const isMine = msg.from === myPhone;
          const nameColor = ROLE_COLOR[msg.role] || "#e5e7eb";
          const badge = ROLE_BADGE[msg.role] || "";

          return (
            <div key={msg.id} style={{
              display: "flex",
              flexDirection: "column",
              alignItems: isMine ? "flex-end" : "flex-start",
            }}>
              {!isMine && msg.showHeader && (
                <div style={{ fontSize: "0.62rem", fontWeight: 700, color: nameColor, marginBottom: "0.15rem", paddingLeft: "0.25rem" }}>
                  {badge} {msg.fromName}
                </div>
              )}
              <div style={{
                maxWidth: "82%",
                padding: "0.45rem 0.7rem",
                borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: isMine ? "linear-gradient(135deg,#7c6fff,#4f46e5)" : "rgba(255,255,255,0.08)",
                color: "#fff",
                fontSize: "0.82rem",
                lineHeight: 1.4,
                wordBreak: "break-word",
              }}>
                {msg.text}
                <div style={{ fontSize: "0.58rem", color: isMine ? "rgba(255,255,255,0.6)" : "#55557a", marginTop: "0.2rem", textAlign: "right" }}>
                  {new Date(msg.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}

        {typerList.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.25rem 0" }}>
            <div style={{ display: "flex", gap: "0.2rem" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: "50%", background: "#55557a",
                  animation: `chatBounce 1s ease-in-out ${i * 0.18}s infinite`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: "0.65rem", color: "#55557a" }}>
              {typerList.join(", ")} typing…
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        display: "flex", gap: "0.4rem", padding: "0.5rem 0.6rem",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        <input
          type="text"
          value={text}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          disabled={!connected}
          placeholder={connected ? "Message the session…" : "Connecting…"}
          style={{
            flex: 1, background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "0.45rem 0.7rem",
            color: "#e2e8f0", fontSize: "0.82rem", outline: "none",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!text.trim() || !connected}
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: text.trim() && connected ? "linear-gradient(135deg,#7c6fff,#4f46e5)" : "rgba(255,255,255,0.06)",
            border: "none", color: "#fff", cursor: text.trim() && connected ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.9rem", transition: "all 0.15s",
          }}
        >
          ➤
        </button>
      </div>

      <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#55557a", padding: "0.25rem", flexShrink: 0 }}>
        💬 Session chat · deleted 12h after session ends
      </div>
    </div>
  );
}
