import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { getSharedSocket } from "../hooks/useSocket";

// WhatsApp-style tick component
function Ticks({ status }) {
  if (!status || status === "sent") {
    return <span className="msg-tick tick-sent" title="Sent">✓</span>;
  }
  if (status === "delivered") {
    return <span className="msg-tick tick-delivered" title="Delivered">✓✓</span>;
  }
  if (status === "seen") {
    return <span className="msg-tick tick-seen" title="Seen">✓✓</span>;
  }
  return null;
}

export default function Chat({ peer, onClose }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [chatError, setChatError] = useState(null);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const socketRef = useRef(null);
  const myPhone = user?.phone;

  useEffect(() => {
    if (!token || !peer?.phone) return;

    const socket = getSharedSocket(token);
    socketRef.current = socket;

    // Sync initial connected state
    setConnected(socket.connected);

    const onConnect = () => {
      setConnected(true);
      setConnectionError(null);
      setChatError(null);
      // Re-join room after reconnect
      socket.emit("chat:join", { peerPhone: peer.phone });
    };

    const onDisconnect = (reason) => {
      setConnected(false);
      if (reason === "io server disconnect") {
        setConnectionError("Disconnected by server. Please refresh.");
      } else {
        setConnectionError("Connection lost. Reconnecting…");
      }
    };

    const onConnectError = () => {
      setConnectionError("Connection failed. Retrying…");
    };

    const onChatError = ({ message }) => {
      setChatError(message);
      setTimeout(() => setChatError(null), 5000);
    };

    const onHistory = ({ messages: msgs }) => {
      setMessages(msgs || []);
      socket.emit("chat:seen", { peerPhone: peer.phone });
    };

    const onMessage = ({ message }) => {
      if (!message) return;
      setMessages((prev) => {
        // Deduplicate by id
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      if (message.from === peer.phone) {
        socket.emit("chat:seen", { peerPhone: peer.phone });
      }
    };

    const onSeen = ({ by }) => {
      if (by === peer.phone) {
        setMessages((prev) =>
          prev.map((m) =>
            m.from === myPhone && m.status !== "seen" ? { ...m, status: "seen" } : m
          )
        );
      }
    };

    const onDelivered = () => {
      setMessages((prev) =>
        prev.map((m) =>
          m.from === myPhone && m.status === "sent" ? { ...m, status: "delivered" } : m
        )
      );
    };

    const onTyping = ({ from, isTyping }) => {
      if (from === peer.phone) setPeerTyping(isTyping);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("chat:error", onChatError);
    socket.on("chat:history", onHistory);
    socket.on("chat:message", onMessage);
    socket.on("chat:seen", onSeen);
    socket.on("chat:delivered", onDelivered);
    socket.on("chat:typing", onTyping);

    // Join the DM room
    socket.emit("chat:join", { peerPhone: peer.phone });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("chat:error", onChatError);
      socket.off("chat:history", onHistory);
      socket.off("chat:message", onMessage);
      socket.off("chat:seen", onSeen);
      socket.off("chat:delivered", onDelivered);
      socket.off("chat:typing", onTyping);
      clearTimeout(typingTimer.current);
    };
  }, [token, peer?.phone, myPhone]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, peerTyping]);

  const sendMessage = useCallback(() => {
    if (!text.trim() || !socketRef.current || !connected) return;
    socketRef.current.emit("chat:send", { peerPhone: peer.phone, text: text.trim() });
    setText("");
    socketRef.current.emit("chat:typing", { peerPhone: peer.phone, isTyping: false });
    clearTimeout(typingTimer.current);
  }, [text, peer?.phone, connected]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (socketRef.current && connected) {
      socketRef.current.emit("chat:typing", { peerPhone: peer.phone, isTyping: true });
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        socketRef.current?.emit("chat:typing", { peerPhone: peer.phone, isTyping: false });
      }, 1500);
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-avatar">{peer.name?.[0]?.toUpperCase() || "?"}</div>
          <div>
            <div className="chat-peer-name">{peer.name}</div>
            <div className="chat-peer-role">{peer.role || "trainer"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`chat-status-dot ${connected ? "online" : "offline"}`} />
          <button className="chat-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Connection / chat error banners */}
      {connectionError && (
        <div style={{
          background: "rgba(248,113,113,0.1)",
          border: "1px solid rgba(248,113,113,0.3)",
          color: "#f87171",
          padding: "0.5rem",
          fontSize: "0.8rem",
          textAlign: "center",
        }}>
          {connectionError}
        </div>
      )}
      {chatError && (
        <div style={{
          background: "rgba(251,191,36,0.1)",
          border: "1px solid rgba(251,191,36,0.3)",
          color: "#fbbf24",
          padding: "0.5rem",
          fontSize: "0.8rem",
          textAlign: "center",
        }}>
          ⚠️ {chatError}
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet. Say hi! 👋</div>
        )}
        {messages.map((msg) => {
          const isMine = msg.from === myPhone;
          return (
            <div key={msg.id} className={`chat-bubble-wrap ${isMine ? "mine" : "theirs"}`}>
              <div className={`chat-bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
                <div className="chat-bubble-text">{msg.text}</div>
                <div className="chat-bubble-time">
                  {new Date(msg.ts).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {isMine && <Ticks status={msg.status} />}
                </div>
              </div>
            </div>
          );
        })}
        {peerTyping && (
          <div className="chat-bubble-wrap theirs">
            <div className="chat-bubble bubble-theirs chat-typing-indicator">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={1}
          placeholder={connected ? "Type a message…" : "Connecting…"}
          value={text}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          disabled={!connected}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={!text.trim() || !connected}
          title={connected ? "Send message" : "Connecting…"}
        >
          ➤
        </button>
      </div>
      <div className="chat-ttl-note">💬 Messages auto-delete after 24h</div>
    </div>
  );
}
