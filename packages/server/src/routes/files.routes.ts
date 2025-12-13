import { Router, Request, Response } from "express";
import { s3Service } from "../services/s3.service";
import type { GetDownloadUrlRequest } from "../types";

const router = Router();

/**
 * GET /api/files
 * List all uploaded files
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { prefix, continuationToken, maxKeys } = req.query;

    const result = await s3Service.listFiles(
      prefix as string,
      continuationToken as string,
      maxKeys ? parseInt(maxKeys as string, 10) : undefined
    );

    res.json(result);
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

/**
 * POST /api/files/download-url
 * Get a presigned URL for downloading a file
 */
router.post("/download-url", async (req: Request, res: Response) => {
  try {
    const { fileKey, fileName, disposition }: GetDownloadUrlRequest = req.body;

    if (!fileKey) {
      return res.status(400).json({ error: "Missing required field: fileKey" });
    }

    const downloadUrl = await s3Service.getPresignedDownloadUrl(
      fileKey,
      fileName,
      disposition || "attachment"
    );

    res.json({
      downloadUrl,
      expiresIn: 3600, // 1 hour
    });
  } catch (error) {
    console.error("Error getting download URL:", error);
    res.status(500).json({ error: "Failed to get download URL" });
  }
});

/**
 * GET /api/files/:fileKey/metadata
 * Get file metadata
 */
router.get("/:fileKey(*)/metadata", async (req: Request, res: Response) => {
  try {
    const { fileKey } = req.params;

    const metadata = await s3Service.getFileMetadata(fileKey);

    if (!metadata) {
      return res.status(404).json({ error: "File not found" });
    }

    res.json(metadata);
  } catch (error) {
    console.error("Error getting file metadata:", error);
    res.status(500).json({ error: "Failed to get file metadata" });
  }
});

/**
 * DELETE /api/files/:fileKey
 * Delete a file
 */
router.delete("/:fileKey(*)", async (req: Request, res: Response) => {
  try {
    const { fileKey } = req.params;

    await s3Service.deleteFile(fileKey);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

export default router;
