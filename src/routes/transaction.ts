import { Router } from "express";
import {
  getBalance,
  getTransactions,
} from "../controllers/transactionController";

const router = Router();
router.get("/balance/:address", getBalance);
router.get("/:address", getTransactions);
export default router;
