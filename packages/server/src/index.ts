import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config";
import uploadRoutes from "./routes/upload.routes";
import filesRoutes from "./routes/files.routes";
import assetsRoutes from "./routes/assets.routes";
import prisma from "./db/prisma";

// Validate environment configuration
try {
  validateConfig();
} catch (error) {
  console.error("Configuration error:", error);
  process.exit(1);
}

const app = express();

// Middleware
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

// Routes
app.use("/api/upload", uploadRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/assets", assetsRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    config: {
      maxFileSize: `${config.upload.maxFileSize / (1024 * 1024 * 1024)}GB`,
      chunkSize: `${config.upload.chunkSize / (1024 * 1024)}MB`,
    },
  });
});

// Error handling
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// Start server
app.listen(config.server.port, async () => {
  console.log(`🚀 Server running on http://localhost:${config.server.port}`);
  console.log(
    `📦 Max file size: ${config.upload.maxFileSize / (1024 * 1024 * 1024)}GB`
  );
  console.log(`📄 Chunk size: ${config.upload.chunkSize / (1024 * 1024)}MB`);

  // Test database connection
  try {
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (error) {
    console.warn("⚠️  Database not connected (run: npm run db:push)");
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
