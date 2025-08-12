import { Router } from "express";
import { estimateFee } from "../controllers/estimateFeeController";

const router = Router();
router.get("/", estimateFee);
export default router;
