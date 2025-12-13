import { apiService } from "./api.service";
import { fileStorageService } from "./fileStorage.service";
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
  fileName: string;
  fileSize: number;
  fileType: string;
  inProgressChunks: Map<number, number>; // partNumber -> bytes uploaded
}

interface SavedUploadState {
  uploadId: string;
  fileKey: string;
  totalChunks: number;
  chunkSize: number;
  completedParts: CompletedPart[];
  uploadedBytes: number;
  startTime: number;
  fileName: string;
  fileSize: number;
  fileType: string;
}

/**
 * Multi-part file upload service with progress tracking and resume support
 * State is stored in database, not localStorage
 */
export class UploadService {
  private state: UploadState | null = null;
  private options: UploadOptions | null = null;

  /**
   * Save upload progress to database via API
   */
  private async saveProgressToDatabase(): Promise<void> {
    if (!this.state) return;

    // Save completed parts to database
    for (const part of this.state.completedParts) {
      try {
        await apiService.markPartCompleted(
          this.state.uploadId,
          part.partNumber,
          part.etag
        );
      } catch (error) {
        // Silently fail - database might not be available
        console.warn("Failed to save progress to database:", error);
      }
    }
  }

  /**
   * Remove upload state (no-op, database handles cleanup)
   */
  private removeState(): void {
    // State is in database, no need to remove from localStorage
    // Database will handle cleanup when upload completes or expires
  }

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
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        inProgressChunks: new Map(),
      };

      // Store file in IndexedDB for automatic resume
      try {
        await fileStorageService.storeFile(initResponse.uploadId, file);
      } catch (error) {
        console.warn("Failed to store file in IndexedDB:", error);
      }

      // Notify progress (state is saved to database via API)
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

      // Verify we have all required parts before completing
      // Use bytes as primary check since it's more reliable than chunk count
      const allBytesUploaded = this.state.uploadedBytes >= this.state.fileSize;
      const allChunksCompleted =
        this.state.completedParts.length === this.state.totalChunks;

      if (!allBytesUploaded && !allChunksCompleted) {
        throw new Error(
          `Not all parts uploaded. Expected ${this.state.totalChunks} chunks, got ${this.state.completedParts.length}. Bytes: ${this.state.uploadedBytes}/${this.state.fileSize}`
        );
      }

      // If bytes are complete, proceed even if chunk count is slightly off
      // This handles edge cases where chunk tracking might be off but upload is complete
      if (allBytesUploaded && !allChunksCompleted) {
        console.warn(
          `Upload bytes complete (${this.state.uploadedBytes}/${this.state.fileSize}) but chunk count mismatch (${this.state.completedParts.length}/${this.state.totalChunks}). Proceeding with completion.`
        );
      }

      // Step 3: Complete the upload
      let completeResponse;
      try {
        completeResponse = await apiService.completeUpload(
          this.state.uploadId,
          this.state.fileKey,
          this.state.completedParts
        );
      } catch (error: any) {
        // If upload doesn't exist, it might already be completed or expired
        const errorMessage = error.response?.data?.error || error.message || "";
        if (
          errorMessage.includes("NoSuchUpload") ||
          errorMessage.includes("does not exist") ||
          errorMessage.includes("expired") ||
          errorMessage.includes("aborted")
        ) {
          // Clear the upload state since it's no longer valid
          try {
            await fileStorageService.removeFile(this.state.uploadId);
          } catch (err) {
            console.warn("Failed to remove file from IndexedDB:", err);
          }
          throw new Error(
            "Upload session expired or was aborted. Please start a new upload."
          );
        }
        throw error;
      }

      // Notify completion
      this.notifyProgress("completed");

      // Remove file from IndexedDB on completion
      try {
        await fileStorageService.removeFile(this.state.uploadId);
      } catch (error) {
        console.warn("Failed to remove file from IndexedDB:", error);
      }

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
   * @param partNumbers - Array of part numbers to upload (can be subset for resume)
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
   * Calculate total uploaded bytes from completed parts and in-progress chunks
   */
  private calculateTotalUploadedBytes(): number {
    if (!this.state || !this.options) return 0;

    const { file } = this.options;
    const { completedParts, chunkSize, inProgressChunks, totalChunks } =
      this.state;

    let totalBytes = 0;

    // Calculate bytes from completed chunks
    // Most chunks are full size, but the last chunk might be smaller
    completedParts.forEach((part) => {
      const start = (part.partNumber - 1) * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const actualChunkSize = end - start;
      totalBytes += actualChunkSize;
    });

    // Add progress from in-progress chunks
    inProgressChunks.forEach((bytes) => {
      totalBytes += bytes;
    });

    // Ensure we don't exceed file size
    return Math.min(totalBytes, file.size);
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

    // Mark this chunk as in progress
    if (this.state) {
      this.state.inProgressChunks.set(partNumber, 0);
    }

    // Upload the chunk with real-time progress tracking
    const etag = await apiService.uploadChunk(
      presignedUrl,
      chunk,
      (progress) => {
        // Update progress for this chunk in real-time
        if (this.state) {
          // Calculate actual bytes uploaded for this chunk
          const chunkBytes = (progress / 100) * chunk.size;
          this.state.inProgressChunks.set(partNumber, chunkBytes);

          // Recalculate total uploaded bytes
          this.state.uploadedBytes = this.calculateTotalUploadedBytes();

          // Notify progress frequently for smooth updates
          this.notifyProgress("uploading");
        }
      }
    );

    // Mark part as completed
    if (this.state) {
      // Remove from in-progress and add to completed
      this.state.inProgressChunks.delete(partNumber);
      this.state.completedParts.push({ partNumber, etag });

      // Recalculate total uploaded bytes
      this.state.uploadedBytes = this.calculateTotalUploadedBytes();

      // Ensure we don't exceed file size (important for last chunk)
      if (this.state.uploadedBytes > file.size) {
        this.state.uploadedBytes = file.size;
      }

      // Save progress to database after each chunk completion (async, don't await)
      this.saveProgressToDatabase().catch((err) => {
        console.warn("Failed to save progress to database:", err);
      });
      this.notifyProgress("uploading");

      // If all bytes are uploaded, trigger completion check
      if (this.state.uploadedBytes >= file.size) {
        // Small delay to ensure state is saved, then check if we should complete
        setTimeout(() => {
          if (this.state && this.state.uploadedBytes >= file.size) {
            // All bytes uploaded, notify that we're ready to complete
            this.notifyProgress("uploading");
          }
        }, 100);
      }
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
      // State is in database, no need to save separately
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
   * Resume an upload from database
   * Automatically retrieves file from IndexedDB if not provided
   */
  async resumeFromDatabase(
    uploadId: string,
    file?: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ fileUrl: string; fileKey: string }> {
    // Fetch state from database via API
    const resumeInfo = await apiService.getResumeInfo(uploadId);
    const savedState = resumeInfo.upload;

    // If file not provided, try to get it from IndexedDB
    let fileToUse = file;
    if (!fileToUse) {
      try {
        fileToUse = await fileStorageService.getFile(uploadId);
        if (!fileToUse) {
          throw new Error(
            "File not found in storage. Please select the file again."
          );
        }
      } catch (error) {
        throw new Error(
          "Failed to retrieve file from storage. Please select the file again."
        );
      }
    }

    this.options = { file: fileToUse, onProgress };

    // Restore state from database
    this.state = {
      uploadId: uploadId,
      fileKey: savedState.fileKey,
      totalChunks: savedState.totalChunks,
      chunkSize: savedState.chunkSize,
      completedParts: savedState.completedParts || [],
      uploadedBytes: savedState.completedParts
        ? savedState.completedParts.length * savedState.chunkSize
        : 0,
      startTime: Date.now(), // Reset start time
      isPaused: false,
      isAborted: false,
      fileName: savedState.fileName,
      fileSize: savedState.fileSize,
      fileType: savedState.fileType,
      inProgressChunks: new Map(), // Reset in-progress chunks on resume
    };

    // Get remaining part numbers to upload
    const uploadedPartNumbers = savedState.completedParts.map(
      (p) => p.partNumber
    );
    const allPartNumbers = Array.from(
      { length: savedState.totalChunks },
      (_, i) => i + 1
    );
    const remainingParts = allPartNumbers.filter(
      (p) => !uploadedPartNumbers.includes(p)
    );

    if (remainingParts.length === 0) {
      // All parts uploaded, just complete the upload
      let completeResponse;
      try {
        completeResponse = await apiService.completeUpload(
          this.state.uploadId,
          this.state.fileKey,
          this.state.completedParts
        );
      } catch (error: any) {
        // If upload doesn't exist, it might already be completed or expired
        const errorMessage = error.response?.data?.error || error.message || "";
        if (
          errorMessage.includes("NoSuchUpload") ||
          errorMessage.includes("does not exist") ||
          errorMessage.includes("expired") ||
          errorMessage.includes("aborted")
        ) {
          // Clear the file from IndexedDB since upload is no longer valid
          try {
            await fileStorageService.removeFile(uploadId);
          } catch (err) {
            console.warn("Failed to remove file from IndexedDB:", err);
          }
          throw new Error(
            "Upload session expired or was aborted. Please start a new upload."
          );
        }
        throw error;
      }
      // Remove file from IndexedDB on completion
      try {
        await fileStorageService.removeFile(this.state.uploadId);
      } catch (error) {
        console.warn("Failed to remove file from IndexedDB:", error);
      }
      return {
        fileUrl: completeResponse.fileUrl,
        fileKey: completeResponse.fileKey,
      };
    }

    try {
      // Notify progress
      this.notifyProgress("uploading");

      // Upload remaining chunks
      await this.uploadChunksWithConcurrency(remainingParts, 3);

      // Check if aborted
      if (this.state.isAborted) {
        throw new Error("Upload aborted");
      }

      // Verify we have all required parts before completing
      // Use bytes as primary check since it's more reliable than chunk count
      const allBytesUploaded = this.state.uploadedBytes >= this.state.fileSize;
      const allChunksCompleted =
        this.state.completedParts.length === this.state.totalChunks;

      if (!allBytesUploaded && !allChunksCompleted) {
        throw new Error(
          `Not all parts uploaded. Expected ${this.state.totalChunks} chunks, got ${this.state.completedParts.length}. Bytes: ${this.state.uploadedBytes}/${this.state.fileSize}`
        );
      }

      // If bytes are complete, proceed even if chunk count is slightly off
      // This handles edge cases where chunk tracking might be off but upload is complete
      if (allBytesUploaded && !allChunksCompleted) {
        console.warn(
          `Upload bytes complete (${this.state.uploadedBytes}/${this.state.fileSize}) but chunk count mismatch (${this.state.completedParts.length}/${this.state.totalChunks}). Proceeding with completion.`
        );
      }

      // Complete the upload
      let completeResponse;
      try {
        completeResponse = await apiService.completeUpload(
          this.state.uploadId,
          this.state.fileKey,
          this.state.completedParts
        );
      } catch (error: any) {
        // If upload doesn't exist, it might already be completed or expired
        const errorMessage = error.response?.data?.error || error.message || "";
        if (
          errorMessage.includes("NoSuchUpload") ||
          errorMessage.includes("does not exist") ||
          errorMessage.includes("expired") ||
          errorMessage.includes("aborted")
        ) {
          // Clear the upload state since it's no longer valid
          try {
            await fileStorageService.removeFile(this.state.uploadId);
          } catch (err) {
            console.warn("Failed to remove file from IndexedDB:", err);
          }
          throw new Error(
            "Upload session expired or was aborted. Please start a new upload."
          );
        }
        throw error;
      }

      // Notify completion
      this.notifyProgress("completed");

      // Remove file from IndexedDB on completion
      try {
        await fileStorageService.removeFile(this.state.uploadId);
      } catch (error) {
        console.warn("Failed to remove file from IndexedDB:", error);
      }

      return {
        fileUrl: completeResponse.fileUrl,
        fileKey: completeResponse.fileKey,
      };
    } catch (error: any) {
      if (this.state?.isAborted) {
        this.notifyProgress("aborted");
        // Remove file on abort
        try {
          await fileStorageService.removeFile(uploadId);
        } catch (err) {
          console.warn("Failed to remove file from IndexedDB:", err);
        }
      } else {
        // Check if upload expired or was aborted
        const errorMessage = error.response?.data?.error || error.message || "";
        if (
          errorMessage.includes("NoSuchUpload") ||
          errorMessage.includes("does not exist") ||
          errorMessage.includes("expired") ||
          errorMessage.includes("aborted")
        ) {
          // Clear the file from IndexedDB since upload is no longer valid
          try {
            await fileStorageService.removeFile(uploadId);
          } catch (err) {
            console.warn("Failed to remove file from IndexedDB:", err);
          }
          this.notifyProgress(
            "failed",
            "Upload session expired. Please start a new upload."
          );
        } else {
          this.notifyProgress("failed", error.message);
        }
      }
      throw error;
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

      // Remove file from IndexedDB on abort
      try {
        await fileStorageService.removeFile(this.state.uploadId);
      } catch (error) {
        console.warn("Failed to remove file from IndexedDB:", error);
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
