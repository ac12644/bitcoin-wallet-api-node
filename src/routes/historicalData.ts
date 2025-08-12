import { Router } from "express";
import { getHistoricalData } from "../controllers/historicalDataController";

const router = Router();
router.get("/", getHistoricalData);
export default router;
