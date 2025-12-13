import { apiService } from "./api.service";
import type { CompletedPart, UploadProgress } from "../types";

export interface UploadOptions {
  file: File;
  onProgress?: (progress: UploadProgress) => void;
  concurrency?: number; // Number of concurrent chunk uploads
  abortSignal?: AbortSignal;
}

interface UploadState {
  uploadId: string;
  fileKey: string;
  totalChunks: number;
  chunkSize: number;
  completedParts: CompletedPart[];
  uploadedBytes: number;
  startTime: number;
  isPaused: boolean;
  isAborted: boolean;
}

/**
 * Multi-part file upload service with progress tracking and resume support
 */
export class UploadService {
  private state: UploadState | null = null;
  private options: UploadOptions | null = null;

  /**
   * Upload a file using S3 multipart upload
   */
  async upload(
    options: UploadOptions
  ): Promise<{ fileUrl: string; fileKey: string }> {
    this.options = options;
    const { file, onProgress, concurrency = 3 } = options;

    try {
      // Step 1: Initiate the multipart upload
      const initResponse = await apiService.initiateUpload(
        file.name,
        file.size,
        file.type || "application/octet-stream"
      );

      this.state = {
        uploadId: initResponse.uploadId,
        fileKey: initResponse.fileKey,
        totalChunks: initResponse.totalChunks,
        chunkSize: initResponse.chunkSize,
        completedParts: [],
        uploadedBytes: 0,
        startTime: Date.now(),
        isPaused: false,
        isAborted: false,
      };

      // Notify progress
      this.notifyProgress("uploading");

      // Step 2: Upload chunks in parallel with concurrency limit
      const partNumbers = Array.from(
        { length: initResponse.totalChunks },
        (_, i) => i + 1
      );

      await this.uploadChunksWithConcurrency(partNumbers, concurrency);

      // Check if aborted
      if (this.state.isAborted) {
        throw new Error("Upload aborted");
      }

      // Step 3: Complete the upload
      const completeResponse = await apiService.completeUpload(
        this.state.uploadId,
        this.state.fileKey,
        this.state.completedParts
      );

      // Notify completion
      this.notifyProgress("completed");

      return {
        fileUrl: completeResponse.fileUrl,
        fileKey: completeResponse.fileKey,
      };
    } catch (error: any) {
      if (this.state?.isAborted) {
        this.notifyProgress("aborted");
      } else {
        this.notifyProgress("failed", error.message);
      }
      throw error;
    }
  }

  /**
   * Upload chunks with concurrency limit
   */
  private async uploadChunksWithConcurrency(
    partNumbers: number[],
    concurrency: number
  ): Promise<void> {
    const queue = [...partNumbers];
    const inProgress: Promise<void>[] = [];

    while (queue.length > 0 || inProgress.length > 0) {
      // Check if paused or aborted
      if (this.state?.isPaused) {
        await new Promise<void>((resolve) => {
          const checkPause = setInterval(() => {
            if (!this.state?.isPaused || this.state?.isAborted) {
              clearInterval(checkPause);
              resolve();
            }
          }, 100);
        });
      }

      if (this.state?.isAborted) {
        break;
      }

      // Start new uploads up to concurrency limit
      while (queue.length > 0 && inProgress.length < concurrency) {
        const partNumber = queue.shift()!;
        const uploadPromise = this.uploadSingleChunk(partNumber);
        inProgress.push(uploadPromise);

        // Remove from inProgress when done
        uploadPromise.finally(() => {
          const index = inProgress.indexOf(uploadPromise);
          if (index > -1) {
            inProgress.splice(index, 1);
          }
        });
      }

      // Wait for at least one to complete
      if (inProgress.length > 0) {
        await Promise.race(inProgress);
      }
    }

    // Wait for all remaining uploads
    await Promise.all(inProgress);
  }

  /**
   * Upload a single chunk
   */
  private async uploadSingleChunk(partNumber: number): Promise<void> {
    if (!this.state || !this.options) return;

    const { file } = this.options;
    const { chunkSize, uploadId, fileKey } = this.state;

    // Calculate chunk boundaries
    const start = (partNumber - 1) * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    // Get presigned URL for this part
    const { presignedUrls } = await apiService.getPresignedUrls(
      uploadId,
      fileKey,
      [partNumber]
    );
    const presignedUrl = presignedUrls[0].url;

    // Upload the chunk
    const etag = await apiService.uploadChunk(
      presignedUrl,
      chunk,
      (progress) => {
        // Update progress for this chunk
        if (this.state) {
          const chunkProgress = (progress / 100) * chunk.size;
          const baseBytes = this.state.completedParts.length * chunkSize;
          this.state.uploadedBytes = baseBytes + chunkProgress;
          this.notifyProgress("uploading");
        }
      }
    );

    // Mark part as completed
    if (this.state) {
      this.state.completedParts.push({ partNumber, etag });
      this.state.uploadedBytes = this.state.completedParts.length * chunkSize;
      if (this.state.uploadedBytes > file.size) {
        this.state.uploadedBytes = file.size;
      }
      this.notifyProgress("uploading");
    }
  }

  /**
   * Notify progress to callback
   */
  private notifyProgress(
    status: UploadProgress["status"],
    error?: string
  ): void {
    if (!this.state || !this.options) return;

    const { file, onProgress } = this.options;
    const elapsed = (Date.now() - this.state.startTime) / 1000;
    const speed = elapsed > 0 ? this.state.uploadedBytes / elapsed : 0;
    const remaining =
      speed > 0 ? (file.size - this.state.uploadedBytes) / speed : 0;

    const progress: UploadProgress = {
      uploadId: this.state.uploadId,
      fileKey: this.state.fileKey,
      fileName: file.name,
      fileSize: file.size,
      status,
      progress: (this.state.uploadedBytes / file.size) * 100,
      uploadedBytes: this.state.uploadedBytes,
      totalChunks: this.state.totalChunks,
      completedChunks: this.state.completedParts.length,
      speed,
      remainingTime: remaining,
      error,
    };

    onProgress?.(progress);
  }

  /**
   * Pause the upload
   */
  pause(): void {
    if (this.state) {
      this.state.isPaused = true;
      this.notifyProgress("paused");
    }
  }

  /**
   * Resume the upload
   */
  resume(): void {
    if (this.state) {
      this.state.isPaused = false;
      this.notifyProgress("uploading");
    }
  }

  /**
   * Abort the upload
   */
  async abort(): Promise<void> {
    if (this.state) {
      this.state.isAborted = true;
      this.state.isPaused = false;

      try {
        await apiService.abortUpload(this.state.uploadId, this.state.fileKey);
      } catch (error) {
        console.error("Failed to abort upload:", error);
      }

      this.notifyProgress("aborted");
    }
  }

  /**
   * Get current state
   */
  getState(): UploadState | null {
    return this.state;
  }
}

/**
 * Create a new upload service instance
 */
export const createUploadService = (): UploadService => {
  return new UploadService();
};
