import { Router } from "express";
import { validateAddress } from "../controllers/validateAddressController";

const router = Router();
router.get("/", validateAddress);
export default router;
