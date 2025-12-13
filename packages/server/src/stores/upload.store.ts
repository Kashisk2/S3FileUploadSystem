import type { UploadStatus } from "../types";

/**
 * In-memory store for tracking upload progress
 * In production, you might want to use Redis or a database
 */
class UploadStore {
  private uploads: Map<string, UploadStatus> = new Map();

  /**
   * Create a new upload record
   */
  create(data: Omit<UploadStatus, "createdAt" | "updatedAt">): UploadStatus {
    const now = new Date();
    const upload: UploadStatus = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.uploads.set(data.uploadId, upload);
    return upload;
  }

  /**
   * Get upload by ID
   */
  get(uploadId: string): UploadStatus | undefined {
    return this.uploads.get(uploadId);
  }

  /**
   * Update upload status
   */
  update(
    uploadId: string,
    data: Partial<UploadStatus>
  ): UploadStatus | undefined {
    const upload = this.uploads.get(uploadId);
    if (!upload) return undefined;

    const updated: UploadStatus = {
      ...upload,
      ...data,
      updatedAt: new Date(),
    };
    this.uploads.set(uploadId, updated);
    return updated;
  }

  /**
   * Mark part as completed
   */
  markPartCompleted(
    uploadId: string,
    partNumber: number
  ): UploadStatus | undefined {
    const upload = this.uploads.get(uploadId);
    if (!upload) return undefined;

    if (!upload.completedParts.includes(partNumber)) {
      upload.completedParts.push(partNumber);
      upload.completedParts.sort((a, b) => a - b);
    }
    upload.updatedAt = new Date();
    this.uploads.set(uploadId, upload);
    return upload;
  }

  /**
   * Delete upload record
   */
  delete(uploadId: string): boolean {
    return this.uploads.delete(uploadId);
  }

  /**
   * Get all uploads
   */
  getAll(): UploadStatus[] {
    return Array.from(this.uploads.values());
  }

  /**
   * Get uploads by status
   */
  getByStatus(status: UploadStatus["status"]): UploadStatus[] {
    return Array.from(this.uploads.values()).filter((u) => u.status === status);
  }

  /**
   * Clean up old uploads (e.g., stale uploads older than 24 hours)
   */
  cleanupStale(maxAgeMs: number = 24 * 60 * 60 * 1000): string[] {
    const now = Date.now();
    const staleIds: string[] = [];

    this.uploads.forEach((upload, id) => {
      if (
        upload.status === "uploading" &&
        now - upload.updatedAt.getTime() > maxAgeMs
      ) {
        staleIds.push(id);
      }
    });

    staleIds.forEach((id) => this.uploads.delete(id));
    return staleIds;
  }
}

export const uploadStore = new UploadStore();
