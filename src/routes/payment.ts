import { Router } from "express";
import { generatePaymentRequestQR } from "../controllers/paymentRequestController";

const router = Router();
router.get("/payment-request-qr", generatePaymentRequestQR);
export default router;
