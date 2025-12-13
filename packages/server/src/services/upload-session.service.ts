import prisma from "../db/prisma";
import { EntityType, UploadStatus } from "@prisma/client";
import { config } from "../config";

export interface CreateUploadSessionInput {
  uploadId: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkSize: number;
  totalChunks: number;
  entityType?: EntityType;
  entityId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

class UploadSessionService {
  /**
   * Create a new upload session
   */
  async createSession(input: CreateUploadSessionInput) {
    const session = await prisma.uploadSession.create({
      data: {
        uploadId: input.uploadId,
        fileKey: input.fileKey,
        bucket: config.aws.bucketName,
        fileName: input.fileName,
        fileSize: BigInt(input.fileSize),
        fileType: input.fileType,
        chunkSize: input.chunkSize,
        totalChunks: input.totalChunks,
        entityType: input.entityType || EntityType.GENERAL,
        entityId: input.entityId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        userId: input.userId,
        status: UploadStatus.PENDING,
        completedParts: [],
        // Expire after 24 hours
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return this.serializeSession(session);
  }

  /**
   * Get session by upload ID
   */
  async getSessionByUploadId(uploadId: string) {
    const session = await prisma.uploadSession.findUnique({
      where: { uploadId },
    });

    if (!session) return null;
    return this.serializeSession(session);
  }

  /**
   * Update session status
   */
  async updateStatus(uploadId: string, status: UploadStatus) {
    const session = await prisma.uploadSession.update({
      where: { uploadId },
      data: { status },
    });

    return this.serializeSession(session);
  }

  /**
   * Mark a part as completed
   */
  async markPartCompleted(uploadId: string, partNumber: number, etag: string) {
    const session = await prisma.uploadSession.findUnique({
      where: { uploadId },
    });

    if (!session) {
      throw new Error("Upload session not found");
    }

    const completedParts = (session.completedParts as CompletedPart[]) || [];

    // Add part if not already completed
    if (!completedParts.find((p) => p.partNumber === partNumber)) {
      completedParts.push({ partNumber, etag });
      completedParts.sort((a, b) => a.partNumber - b.partNumber);
    }

    const updated = await prisma.uploadSession.update({
      where: { uploadId },
      data: {
        completedParts,
        status: UploadStatus.UPLOADING,
      },
    });

    return this.serializeSession(updated);
  }

  /**
   * Get completed parts for an upload
   */
  async getCompletedParts(uploadId: string): Promise<CompletedPart[]> {
    const session = await prisma.uploadSession.findUnique({
      where: { uploadId },
    });

    if (!session) return [];
    return (session.completedParts as CompletedPart[]) || [];
  }

  /**
   * Get remaining parts for resume
   */
  async getRemainingParts(uploadId: string) {
    const session = await prisma.uploadSession.findUnique({
      where: { uploadId },
    });

    if (!session) {
      throw new Error("Upload session not found");
    }

    const completedParts = (session.completedParts as CompletedPart[]) || [];
    const completedPartNumbers = completedParts.map((p) => p.partNumber);
    const allPartNumbers = Array.from(
      { length: session.totalChunks },
      (_, i) => i + 1
    );
    const remainingParts = allPartNumbers.filter(
      (p) => !completedPartNumbers.includes(p)
    );

    return {
      session: this.serializeSession(session),
      completedParts,
      remainingParts,
      progress: (completedParts.length / session.totalChunks) * 100,
    };
  }

  /**
   * Delete session
   */
  async deleteSession(uploadId: string) {
    await prisma.uploadSession.delete({
      where: { uploadId },
    });
  }

  /**
   * List active sessions for a user
   */
  async listUserSessions(userId: string, status?: UploadStatus) {
    const where: any = { userId };
    if (status) where.status = status;

    const sessions = await prisma.uploadSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return sessions.map(this.serializeSession);
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    const result = await prisma.uploadSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { not: UploadStatus.COMPLETED },
      },
    });

    return result.count;
  }

  /**
   * Serialize session for API response
   */
  private serializeSession(session: any) {
    return {
      ...session,
      fileSize: Number(session.fileSize),
    };
  }
}

export const uploadSessionService = new UploadSessionService();
