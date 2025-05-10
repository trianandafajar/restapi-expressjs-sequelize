import express from "express";
import userRouter from "./userRoute.js";
import contactRouter from "./contactRoute.js";
import { errorHandling } from "../controllers/errorHandlingController.js";

const route = express.Router();

// Routes
route.use("/api", userRouter);
route.use("/api", contactRouter);

// 404 handler
route.use("*", (req, res) => {
  res.status(404).json({
    errors: ["Page Not Found"],
    message: "Invalid Route",
    data: null,
  });
});

// Global error handler
route.use(errorHandling);

export default route;
