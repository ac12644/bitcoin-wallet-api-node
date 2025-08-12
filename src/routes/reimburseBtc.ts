import { Router } from "express";
import { reimburseBitcoin } from "../controllers/reimburseBtcController";

const router = Router();
router.post("/reimburseBitcoin", reimburseBitcoin);
export default router;
