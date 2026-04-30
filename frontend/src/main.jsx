import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Capture beforeinstallprompt ASAP — before React mounts
// so we never miss the event
window.__pwaInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
  // Dispatch a custom event so any already-mounted listeners can react
  window.dispatchEvent(new Event("pwa-prompt-ready"));
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Unregister any existing service workers to prevent stale cache blank screens.
// Re-enable once a proper cache-busting strategy is in place.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister();
      console.log("[SW] Unregistered:", reg.scope);
    }
  });
}
