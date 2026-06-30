import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getGuestPreview, trackGuestVisit, getRegistrationSlots } from "../controllers/guestController.js";

const router = Router();

const guestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(guestLimiter);

// Guest preview dashboard data
router.get("/preview", getGuestPreview);

// Track guest visit (collect interest data, expires in 24h)
router.post("/visit", trackGuestVisit);

// How many registration slots left today
router.get("/slots", getRegistrationSlots);

export default router;
