import { useEffect, useState, useCallback } from "react";
import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
  useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";

// ── Session Info Panel ───────────────────────────────────────────────────────
function SessionInfoPanel({ session }) {
  const participants = useParticipants();
  const participantCount = participants.length;
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <div style={{
      position: "fixed", 
      top: 70, 
      left: 12, 
      zIndex: 1000,
      background: "rgba(19,19,42,0.95)", 
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(124,111,255,0.3)",
      borderRadius: 14, 
      padding: isMinimized ? "0.75rem" : "1rem", 
      width: isMinimized ? "auto" : 280,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      transition: "all 0.3s ease",
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        marginBottom: isMinimized ? 0 : "0.75rem"
      }}>
        <div style={{ 
          fontWeight: 700, 
          color: "#fff", 
          fontSize: "0.9rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem"
        }}>
          <span>🔴</span>
          {!isMinimized && <span>Live Session</span>}
        </div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          style={{
            background: "none",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: "0.8rem",
            padding: "0.2rem"
          }}
        >
          {isMinimized ? "📋" : "➖"}
        </button>
      </div>
      
      {!isMinimized && (
        <>
          <div style={{ 
            fontSize: "0.85rem", 
            color: "#e2e8f0", 
            fontWeight: 600,
            marginBottom: "0.5rem",
            lineHeight: 1.3
          }}>
            {session?.title}
          </div>
          
          {session?.description && (
            <div style={{ 
              fontSize: "0.75rem", 
              color: "var(--muted)",
              marginBottom: "0.75rem",
              lineHeight: 1.4
            }}>
              {session.description}
            </div>
          )}
          
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "0.4rem",
            fontSize: "0.75rem",
            color: "var(--muted)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>👥</span>
              <span>{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>⏰</span>
              <span>Started {new Date(session?.startedAt || Date.now()).toLocaleTimeString("en-IN", { timeStyle: "short" })}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Admin controls panel shown inside the room ───────────────────────────────
function AdminControls({ sessionId }) {
  const participants = useParticipants();
  const [busy, setBusy] = useState({});
  const toast = useToast();

  const action = async (type, identity) => {
    setBusy(b => ({ ...b, [identity]: true }));
    try {
      await api.post(`/live-sessions/${sessionId}/${type}/${encodeURIComponent(identity)}`);
      toast(`Participant ${type}d successfully`, "success");
    } catch (e) {
      toast(e.response?.data?.error || `${type} failed`, "error");
    } finally {
      setBusy(b => ({ ...b, [identity]: false }));
    }
  };

  return (
    <div style={{
      position: "fixed", top: 70, right: 12, zIndex: 1000,
      background: "rgba(19,19,42,0.95)", 
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(124,111,255,0.3)",
      borderRadius: 14, padding: "1rem", width: 260,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      maxHeight: "70vh", overflowY: "auto",
    }}>
      <div style={{ 
        fontWeight: 700, 
        color: "#fff", 
        marginBottom: "0.75rem", 
        fontSize: "0.9rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <span>🛡️ Admin Controls</span>
        <span style={{ 
          background: "rgba(124,111,255,0.2)", 
          padding: "0.2rem 0.5rem", 
          borderRadius: "8px",
          fontSize: "0.75rem"
        }}>
          {participants.length}
        </span>
      </div>
      
      {participants.length === 0 ? (
        <div style={{ 
          textAlign: "center", 
          color: "var(--muted)", 
          fontSize: "0.8rem",
          padding: "1rem 0"
        }}>
          No participants yet
        </div>
      ) : (
        participants.map(p => (
          <div key={p.identity} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.6rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
            gap: "0.5rem",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontSize: "0.8rem", 
                color: "#e2e8f0", 
                fontWeight: 600,
                overflow: "hidden", 
                textOverflow: "ellipsis", 
                whiteSpace: "nowrap" 
              }}>
                {p.name || p.identity}
              </div>
              <div style={{ 
                fontSize: "0.7rem", 
                color: "var(--muted)",
                display: "flex",
                gap: "0.5rem",
                marginTop: "0.2rem"
              }}>
                <span>{p.isCameraEnabled ? "📹" : "📹❌"}</span>
                <span>{p.isMicrophoneEnabled ? "🎤" : "🎤❌"}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <button
                onClick={() => action("mute", p.identity)}
                disabled={busy[p.identity]}
                title="Mute participant"
                style={{ 
                  fontSize: "0.7rem", 
                  padding: "0.3rem 0.6rem", 
                  borderRadius: 6, 
                  border: "1px solid rgba(251,191,36,0.4)", 
                  background: "rgba(251,191,36,0.1)", 
                  color: "#fbbf24", 
                  cursor: "pointer",
                  opacity: busy[p.identity] ? 0.5 : 1
                }}
              >
                🔇
              </button>
              <button
                onClick={() => action("remove", p.identity)}
                disabled={busy[p.identity]}
                title="Remove participant"
                style={{ 
                  fontSize: "0.7rem", 
                  padding: "0.3rem 0.6rem", 
                  borderRadius: 6, 
                  border: "1px solid rgba(248,113,113,0.4)", 
                  background: "rgba(248,113,113,0.1)", 
                  color: "#f87171", 
                  cursor: "pointer",
                  opacity: busy[p.identity] ? 0.5 : 1
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main LiveRoom component ──────────────────────────────────────────────────
export default function LiveRoom({ sessionId, userRole, onLeave, onSessionEnded }) {
  const [token, setToken]       = useState(null);
  const [livekitUrl, setUrl]    = useState(null);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [session, setSession]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Get session details and token
        const [sessionRes, tokenRes] = await Promise.all([
          api.get(`/live-sessions/${sessionId}`),
          api.post(`/live-sessions/${sessionId}/token`)
        ]);
        
        setSession(sessionRes.data);
        setToken(tokenRes.data.token);
        setUrl(tokenRes.data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL);
      } catch (e) {
        setError(e.response?.data?.error || "Failed to join session");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: "1rem" }}>
      <div className="spinner" />
      <p style={{ color: "var(--muted)" }}>Joining session…</p>
    </div>
  );

  if (error) return (
    <div className="error-box">
      <p>{error}</p>
      <button className="btn-secondary" onClick={onLeave} style={{ marginTop: "0.75rem" }}>← Back</button>
    </div>
  );

  return (
    <div style={{ position: "relative", height: "calc(100vh - 120px)", minHeight: 400 }}>
      <LiveKitRoom
        token={token}
        serverUrl={livekitUrl}
        connect={true}
        video={true}
        audio={true}
        onDisconnected={onLeave}
        style={{ height: "100%" }}
      >
        <VideoConference />
        <SessionInfoPanel session={session} />
        {userRole === "admin" && <AdminControls sessionId={sessionId} />}
      </LiveKitRoom>
    </div>
  );
}
