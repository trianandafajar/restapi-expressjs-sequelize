import logger from "../middleware/winston.js";
import { verifyAccessToken } from "../utils/jwt.js";

/**
 * Global error handler middleware
 */
const errorHandling = (err, req, res, next) => {
  // Jika format pesan error sesuai pola "file:func - message"
  const message = err.message.includes(" - ") ? err.message.split(" - ")[1] : err.message;

  // Log detail error ke logger (winston)
  logger.error(err);

  res.status(500).json({
    errors: [message || "Unknown error"],
    message: "Internal Server Error",
    data: null,
  });
};

/**
 * Authentication middleware to verify JWT token
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      errors: ["Token not found"],
      message: "Authentication Failed",
      data: null,
    });
  }

  try {
    const user = verifyAccessToken(token);
    if (!user) {
      return res.status(401).json({
        errors: ["Invalid token"],
        message: "Authentication Failed",
        data: null,
      });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      errors: ["Token verification failed"],
      message: "Authentication Failed",
      data: null,
    });
  }
};

export { errorHandling, authenticate };
