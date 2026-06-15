import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import documentsRouter from "./documents";
import chatRouter from "./chat";
import clausesRouter from "./clauses";
import draftsRouter from "./drafts";
import advocatesRouter from "./advocates";
import emailsRouter from "./emails";
import adminRouter from "./admin";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(documentsRouter);
router.use(chatRouter);
router.use(clausesRouter);
router.use(draftsRouter);
router.use(advocatesRouter);
router.use(emailsRouter);
router.use(adminRouter);
router.use(historyRouter);

export default router;
