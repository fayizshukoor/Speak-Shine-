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

// Register service worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("SW registered:", reg.scope);
        // When a new SW is waiting, activate it immediately
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New SW installed — reload to get fresh assets
              console.log("[SW] New version available — reloading");
              window.location.reload();
            }
          });
        });
      })
      .catch((err) => console.warn("SW registration failed:", err));

    // If the SW controller changes (new SW took over), reload
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  });
}
