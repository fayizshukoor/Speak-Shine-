/**
 * Chat Routes
 * URL mapping for chat endpoints
 *
 * IMPORTANT: named routes (/group, /peers, /trainers, /users) MUST come
 * before the wildcard /:peerPhone route or Express will swallow them.
 */

import express from "express";
import * as chatController from "../controllers/chatController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Group chat history (all roles)
router.get("/group",   authMiddleware, chatController.getGroupChatHistory);

// Role-aware DM peer list — single endpoint, logic lives in the service
router.get("/peers",   authMiddleware, chatController.getPeers);

// Legacy endpoints kept for backwards compatibility
router.get("/trainers", authMiddleware, chatController.getAvailableTrainers);
router.get("/users",    authMiddleware, requireRole("trainer", "admin"), chatController.getAvailableUsers);

// DM history — must be last (wildcard)
router.get("/:peerPhone", authMiddleware, chatController.getChatHistory);

export default router;
