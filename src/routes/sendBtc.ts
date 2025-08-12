import { Router } from "express";
import { sendBitcoin } from "../controllers/sendBtcController";

const router = Router();
router.post("/", sendBitcoin);
export default router;
