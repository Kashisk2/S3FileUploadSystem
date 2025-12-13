import { Router, Request, Response } from "express";
import { s3Service } from "../services/s3.service";
import { uploadStore } from "../stores/upload.store";
import { uploadSessionService } from "../services/upload-session.service";
import { assetService } from "../services/asset.service";
import { config } from "../config";
import { EntityType, UploadStatus } from "@prisma/client";
import prisma from "../db/prisma";
import type {
  InitiateUploadRequest,
  CompleteUploadRequest,
  GetPresignedUrlRequest,
  GetPresignedUrlsRequest,
  AbortUploadRequest,
} from "../types";
import type { CompletedPart } from "../services/upload-session.service";

const router = Router();

/**
 * POST /api/upload/initiate
 * Start a new multipart upload
 */
router.post("/initiate", async (req: Request, res: Response) => {
  try {
    const {
      fileName,
      fileSize,
      fileType,
      // Optional entity info for asset management
      entityType,
      entityId,
      workspaceId,
      projectId,
      userId,
    } = req.body;

    // Validate request
    if (!fileName || !fileSize || !fileType) {
      return res.status(400).json({
        error: "Missing required fields: fileName, fileSize, fileType",
      });
    }

    // Check file size limit
    if (fileSize > config.upload.maxFileSize) {
      return res.status(400).json({
        error: `File size exceeds maximum allowed size of ${
          config.upload.maxFileSize / (1024 * 1024 * 1024)
        }GB`,
      });
    }

    // Initiate multipart upload
    const result = await s3Service.initiateMultipartUpload({
      fileName,
      fileSize,
      fileType,
    });

    // Store upload metadata in memory (for quick access)
    uploadStore.create({
      uploadId: result.uploadId,
      fileKey: result.fileKey,
      fileName,
      fileSize,
      fileType,
      completedParts: [],
      totalChunks: result.totalChunks,
      status: "pending",
    });

    // Also store in database (for persistence)
    try {
      await uploadSessionService.createSession({
        uploadId: result.uploadId,
        fileKey: result.fileKey,
        fileName,
        fileSize,
        fileType,
        chunkSize: result.chunkSize,
        totalChunks: result.totalChunks,
        entityType: entityType as EntityType,
        entityId,
        workspaceId,
        projectId,
        userId,
      });
    } catch (dbError) {
      // Database might not be set up - continue without it
      console.warn("Database not available, using in-memory store only");
    }

    res.json(result);
  } catch (error) {
    console.error("Error initiating upload:", error);
    res.status(500).json({ error: "Failed to initiate upload" });
  }
});

/**
 * POST /api/upload/presigned-url
 * Get a presigned URL for uploading a single part
 */
router.post("/presigned-url", async (req: Request, res: Response) => {
  try {
    const { uploadId, fileKey, partNumber }: GetPresignedUrlRequest = req.body;

    if (!uploadId || !fileKey || !partNumber) {
      return res.status(400).json({
        error: "Missing required fields: uploadId, fileKey, partNumber",
      });
    }

    const presignedUrl = await s3Service.getPresignedUploadUrl(
      uploadId,
      fileKey,
      partNumber
    );

    // Update upload status
    uploadStore.update(uploadId, { status: "uploading" });

    res.json({ presignedUrl, partNumber });
  } catch (error) {
    console.error("Error getting presigned URL:", error);
    res.status(500).json({ error: "Failed to get presigned URL" });
  }
});

/**
 * POST /api/upload/presigned-urls
 * Get presigned URLs for multiple parts (batch)
 */
router.post("/presigned-urls", async (req: Request, res: Response) => {
  try {
    const { uploadId, fileKey, partNumbers }: GetPresignedUrlsRequest =
      req.body;

    if (!uploadId || !fileKey || !partNumbers || !Array.isArray(partNumbers)) {
      return res.status(400).json({
        error: "Missing required fields: uploadId, fileKey, partNumbers",
      });
    }

    const presignedUrls = await s3Service.getPresignedUploadUrls(
      uploadId,
      fileKey,
      partNumbers
    );

    // Update upload status in database
    try {
      await uploadSessionService.updateStatus(uploadId, UploadStatus.UPLOADING);
    } catch (dbError) {
      console.warn("Could not update session status in database:", dbError);
    }

    // Update upload status in memory store
    uploadStore.update(uploadId, { status: "uploading" });

    res.json({ presignedUrls });
  } catch (error) {
    console.error("Error getting presigned URLs:", error);
    res.status(500).json({ error: "Failed to get presigned URLs" });
  }
});

/**
 * POST /api/upload/complete-part
 * Mark a part as completed (for tracking)
 */
router.post("/complete-part", async (req: Request, res: Response) => {
  try {
    const { uploadId, partNumber, etag } = req.body;

    if (!uploadId || !partNumber || !etag) {
      return res.status(400).json({
        error: "Missing required fields: uploadId, partNumber, etag",
      });
    }

    // Update in-memory store
    uploadStore.markPartCompleted(uploadId, partNumber);

    // Also update in database
    try {
      await uploadSessionService.markPartCompleted(uploadId, partNumber, etag);
    } catch (dbError) {
      // Database might not be set up - continue without it
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking part complete:", error);
    res.status(500).json({ error: "Failed to mark part complete" });
  }
});

/**
 * POST /api/upload/complete
 * Complete the multipart upload
 */
router.post("/complete", async (req: Request, res: Response) => {
  try {
    const { uploadId, fileKey, parts }: CompleteUploadRequest = req.body;

    if (!uploadId || !fileKey || !parts || !Array.isArray(parts)) {
      return res.status(400).json({
        error: "Missing required fields: uploadId, fileKey, parts",
      });
    }

    // Validate parts
    for (const part of parts) {
      if (!part.partNumber || !part.etag) {
        return res.status(400).json({
          error: "Each part must have partNumber and etag",
        });
      }
    }

    console.log(
      `[POST /upload/complete] Completing upload ${uploadId} with ${parts.length} parts`
    );

    let result;
    try {
      result = await s3Service.completeMultipartUpload(
        uploadId,
        fileKey,
        parts
      );
      console.log(
        `[POST /upload/complete] Successfully completed upload ${uploadId}`
      );
    } catch (error: any) {
      console.error(
        `[POST /upload/complete] Error in completeMultipartUpload:`,
        error.message || error
      );
      throw error;
    }

    // Update upload status in database
    try {
      await uploadSessionService.updateStatus(uploadId, UploadStatus.COMPLETED);
      console.log(
        `[POST /upload/complete] Updated upload status to COMPLETED in database`
      );
    } catch (dbError) {
      console.warn("Could not update session status in database:", dbError);
    }

    // Update upload status in memory store
    uploadStore.update(uploadId, { status: "completed" });

    // Create asset in database
    let asset = null;
    try {
      asset = await assetService.createAssetFromUpload(uploadId, result.etag);
    } catch (dbError) {
      // Database might not be set up - continue without it
      console.warn("Could not save asset to database:", dbError);
    }

    res.json({
      ...result,
      asset, // Include the created asset in the response
    });
  } catch (error: any) {
    console.error("Error completing upload:", error);

    // Provide more detailed error messages
    const errorMessage = error.message || "Failed to complete upload";
    const statusCode =
      errorMessage.includes("NoSuchUpload") ||
      errorMessage.includes("does not exist")
        ? 404
        : errorMessage.includes("Part") &&
          errorMessage.includes("does not exist")
        ? 400
        : 500;

    res.status(statusCode).json({
      error: errorMessage,
      details: error.name || error.Code || "Unknown error",
    });
  }
});

/**
 * POST /api/upload/abort
 * Abort a multipart upload
 */
router.post("/abort", async (req: Request, res: Response) => {
  try {
    const { uploadId, fileKey }: AbortUploadRequest = req.body;

    if (!uploadId || !fileKey) {
      return res.status(400).json({
        error: "Missing required fields: uploadId, fileKey",
      });
    }

    await s3Service.abortMultipartUpload(uploadId, fileKey);

    // Update upload status
    uploadStore.update(uploadId, { status: "aborted" });

    res.json({ success: true });
  } catch (error) {
    console.error("Error aborting upload:", error);
    res.status(500).json({ error: "Failed to abort upload" });
  }
});

/**
 * GET /api/upload/status/:uploadId
 * Get upload status
 */
router.get("/status/:uploadId", async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;

    const upload = uploadStore.get(uploadId);

    if (!upload) {
      return res.status(404).json({ error: "Upload not found" });
    }

    res.json(upload);
  } catch (error) {
    console.error("Error getting upload status:", error);
    res.status(500).json({ error: "Failed to get upload status" });
  }
});

/**
 * GET /api/upload/incomplete
 * Get all incomplete upload sessions from database
 */
router.get("/incomplete", async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    // Get incomplete sessions from database
    const sessions = await prisma.uploadSession.findMany({
      where: {
        status: {
          in: [UploadStatus.PENDING, UploadStatus.UPLOADING],
        },
        expiresAt: {
          gt: new Date(), // Not expired
        },
        ...(userId && { userId: userId as string }),
      },
      orderBy: { createdAt: "desc" },
    });

    const incompleteUploads = sessions.map((session) => {
      const completedParts = (session.completedParts as CompletedPart[]) || [];
      const progress = (completedParts.length / session.totalChunks) * 100;
      const uploadedBytes = completedParts.length * session.chunkSize;

      return {
        uploadId: session.uploadId,
        fileKey: session.fileKey,
        fileName: session.fileName,
        fileSize: Number(session.fileSize),
        fileType: session.fileType,
        totalChunks: session.totalChunks,
        chunkSize: session.chunkSize,
        completedParts,
        uploadedBytes: Math.min(uploadedBytes, Number(session.fileSize)),
        progress,
        status: session.status,
        createdAt: session.createdAt,
      };
    });

    res.json({ uploads: incompleteUploads });
  } catch (error) {
    console.error("Error getting incomplete uploads:", error);
    res.status(500).json({ error: "Failed to get incomplete uploads" });
  }
});

/**
 * GET /api/upload/resume/:uploadId
 * Get upload status and remaining parts for resume
 */
router.get("/resume/:uploadId", async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;

    // Get session from database
    const session = await uploadSessionService.getSessionByUploadId(uploadId);

    if (!session) {
      return res.status(404).json({ error: "Upload session not found" });
    }

    // Get already uploaded parts from S3
    const uploadedParts = await s3Service.listUploadedParts(
      session.uploadId,
      session.fileKey
    );

    // Calculate remaining parts
    const uploadedPartNumbers = uploadedParts.map((p) => p.partNumber);
    const allPartNumbers = Array.from(
      { length: session.totalChunks },
      (_, i) => i + 1
    );
    const remainingParts = allPartNumbers.filter(
      (p) => !uploadedPartNumbers.includes(p)
    );

    const completedParts = (session.completedParts as CompletedPart[]) || [];

    res.json({
      upload: {
        uploadId: session.uploadId,
        fileKey: session.fileKey,
        fileName: session.fileName,
        fileSize: session.fileSize,
        fileType: session.fileType,
        totalChunks: session.totalChunks,
        chunkSize: session.chunkSize,
        completedParts,
      },
      uploadedParts,
      remainingParts,
      progress: (uploadedParts.length / session.totalChunks) * 100,
    });
  } catch (error) {
    console.error("Error getting resume info:", error);
    res.status(500).json({ error: "Failed to get resume info" });
  }
});

export default router;
