import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getSharedSocket } from "../hooks/useSocket";
import api from "../api/client";
import Chat from "./Chat";
import GroupChat from "./GroupChat";

const API_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : typeof window !== "undefined"
  ? window.location.origin
  : "";

const ROLE_BADGE  = { admin: "👑", trainer: "🎓", user: "👤" };
const ROLE_LABEL  = { admin: "Admin", trainer: "Trainer", user: "Student" };
const ROLE_COLOR  = { admin: "#f59e0b", trainer: "#6c63ff", user: "#94a3b8" };

// Group peers by role for a cleaner list
function groupByRole(peers) {
  const order = ["admin", "trainer", "user"];
  const groups = {};
  for (const p of peers) {
    if (!groups[p.role]) groups[p.role] = [];
    groups[p.role].push(p);
  }
  return order.filter((r) => groups[r]?.length).map((r) => ({ role: r, peers: groups[r] }));
}

export default function ChatLauncher() {
  const { token, user } = useAuth();
  const [peers, setPeers] = useState([]);
  const [activePeer, setActivePeer] = useState(null);
  const [showGroup, setShowGroup] = useState(false);
  const [showList, setShowList] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loadingPeers, setLoadingPeers] = useState(false);

  // Load peer list from the role-aware /peers endpoint
  useEffect(() => {
    if (!user) return;
    setLoadingPeers(true);
    // Use the api client (withCredentials) instead of raw fetch to send cookies
    api.get("/chat/peers")
      .then(({ data }) => setPeers(Array.isArray(data) ? data : []))
      .catch(() => setPeers([]))
      .finally(() => setLoadingPeers(false));
  }, [user]);

  // DM notifications via shared socket (no extra connection)
  useEffect(() => {
    if (!token) return;
    const socket = getSharedSocket(token);
    const onNotify = () => setUnread((n) => n + 1);
    socket.on("chat:notify", onNotify);
    return () => socket.off("chat:notify", onNotify);
  }, [token]);

  if (!user) return null;

  const openGroup = () => {
    setShowGroup(true);
    setActivePeer(null);
    setShowList(false);
    setUnread(0);
  };

  const openDM = (peer) => {
    setActivePeer(peer);
    setShowGroup(false);
    setShowList(false);
    setUnread(0);
  };

  const closeAll = () => {
    setActivePeer(null);
    setShowGroup(false);
  };

  const isOpen = activePeer || showGroup;
  const grouped = groupByRole(peers);

  return (
    <>
      {showGroup && (
        <GroupChat onClose={closeAll} onUnread={() => setUnread((n) => n + 1)} />
      )}

      {activePeer && <Chat peer={activePeer} onClose={closeAll} />}

      {/* Peer list dropdown */}
      {showList && !isOpen && (
        <div className="chat-peer-list">
          {/* Group chat entry */}
          <button className="chat-peer-item group-entry" onClick={openGroup}>
            <div className="chat-avatar group-avatar sm">🗣️</div>
            <div>
              <div className="chat-peer-name">Speak &amp; Shine Group</div>
              <div className="chat-peer-role">Everyone · 24h messages</div>
            </div>
          </button>

          {/* DM section */}
          {loadingPeers ? (
            <div className="chat-peer-empty">Loading…</div>
          ) : peers.length === 0 ? (
            <div className="chat-peer-empty">No contacts available</div>
          ) : (
            grouped.map(({ role, peers: rolePeers }) => (
              <div key={role}>
                <div className="chat-peer-divider" style={{ color: ROLE_COLOR[role] }}>
                  {ROLE_BADGE[role]} {ROLE_LABEL[role]}s
                </div>
                {rolePeers.map((p) => (
                  <button
                    key={p.phone}
                    className="chat-peer-item"
                    onClick={() => openDM(p)}
                  >
                    <div
                      className="chat-avatar sm"
                      style={{ background: `${ROLE_COLOR[p.role]}22`, color: ROLE_COLOR[p.role] }}
                    >
                      {p.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <div className="chat-peer-name">{p.name}</div>
                      <div className="chat-peer-role" style={{ color: ROLE_COLOR[p.role] }}>
                        {ROLE_BADGE[p.role]} {ROLE_LABEL[p.role]}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* FAB */}
      <button
        className="chat-fab"
        onClick={() => {
          setShowList((v) => !v);
          setUnread(0);
        }}
        title="Chat"
      >
        💬
        {unread > 0 && <span className="chat-fab-badge">{unread}</span>}
      </button>
    </>
  );
}
