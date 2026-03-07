import {Router} from "express";
import uploadRoutes from "./upload_routes";
const router = Router();

router.use("/storage", uploadRoutes);


export default router;