/**
 * Shared Socket.io singleton hook.
 * All chat components share one socket connection per token.
 */
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : typeof window !== "undefined"
  ? window.location.origin
  : "";

// Module-level singleton — one socket per browser session
let _socket = null;
let _currentToken = null;

export function getSharedSocket(token) {
  // If token changed (e.g. re-login), tear down old socket
  if (_socket && _currentToken !== token) {
    _socket.disconnect();
    _socket = null;
    _currentToken = null;
  }

  if (!_socket || _socket.disconnected) {
    _socket = io(API_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 8000,
    });
    _currentToken = token;
  }

  return _socket;
}

/**
 * React hook that returns the shared socket and ensures cleanup on unmount.
 * Does NOT disconnect on unmount — the socket is shared across components.
 */
export function useSharedSocket(token) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    socketRef.current = getSharedSocket(token);
  }, [token]);

  return socketRef;
}
