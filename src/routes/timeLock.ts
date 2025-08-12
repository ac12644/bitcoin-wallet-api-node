import { Router } from "express";
import { createTimeLockTransaction } from "../controllers/timeLockController";

const router = Router();
router.post("/", createTimeLockTransaction);
export default router;
