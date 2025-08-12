import { Router } from "express";
import { verifyTx } from "../controllers/verifyTxController";

const router = Router();
router.post("/", verifyTx);
export default router;
