import { useState, useCallback, useRef, useEffect } from "react";
import { UploadService, createUploadService } from "../services/upload.service";
import { fileStorageService } from "../services/fileStorage.service";
import { apiService } from "../services/api.service";
import type { UploadProgress } from "../types";

interface IncompleteUpload {
  uploadId: string;
  fileName: string;
  fileSize: number;
  progress: number;
  uploadedBytes: number;
}

interface UseUploadReturn {
  uploadFile: (file: File) => Promise<{ fileUrl: string; fileKey: string }>;
  resumeUpload: (
    uploadId: string,
    file?: File
  ) => Promise<{ fileUrl: string; fileKey: string }>;
  pause: () => void;
  resume: () => void;
  abort: () => Promise<void>;
  progress: UploadProgress | null;
  isUploading: boolean;
  isPaused: boolean;
  error: string | null;
  incompleteUploads: IncompleteUpload[];
  clearIncompleteUpload: (uploadId: string) => void;
}

export const useUpload = (): UseUploadReturn => {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incompleteUploads, setIncompleteUploads] = useState<
    IncompleteUpload[]
  >([]);
  const uploadServiceRef = useRef<UploadService | null>(null);
  const activeResumesRef = useRef<Set<string>>(new Set()); // Track active resumes to prevent duplicates

  // Load incomplete uploads from database on mount and auto-resume them
  useEffect(() => {
    const loadAndAutoResume = async () => {
      try {
        // Fetch incomplete uploads from database
        const response = await apiService.getIncompleteUploads();
        const incomplete: IncompleteUpload[] = response.uploads.map(
          (upload) => ({
            uploadId: upload.uploadId,
            fileName: upload.fileName,
            fileSize: upload.fileSize,
            progress: upload.progress,
            uploadedBytes: upload.uploadedBytes,
          })
        );

        setIncompleteUploads(incomplete);

        // Then auto-resume all incomplete uploads in background (like YouTube)
        // Don't await - let them run in parallel
        incomplete.forEach((incompleteUpload) => {
          // Prevent duplicate resumes for the same upload
          if (activeResumesRef.current.has(incompleteUpload.uploadId)) {
            console.log(
              `Skipping duplicate resume for upload ${incompleteUpload.uploadId}`
            );
            return;
          }
          activeResumesRef.current.add(incompleteUpload.uploadId);

          // Resume in background without blocking
          const uploadService = createUploadService();
          uploadService
            .resumeFromDatabase(
              incompleteUpload.uploadId,
              undefined, // File will be retrieved from IndexedDB
              (progressData) => {
                // Update incomplete uploads list with new progress in real-time
                setIncompleteUploads((prev) =>
                  prev.map((u) =>
                    u.uploadId === incompleteUpload.uploadId
                      ? {
                          ...u,
                          progress: Math.min(progressData.progress, 100),
                          uploadedBytes: progressData.uploadedBytes,
                        }
                      : u
                  )
                );
              }
            )
            .then(() => {
              // Remove from list on completion
              setIncompleteUploads((prev) =>
                prev.filter((u) => u.uploadId !== incompleteUpload.uploadId)
              );
              activeResumesRef.current.delete(incompleteUpload.uploadId);
            })
            .catch((error: any) => {
              // Remove from active resumes on error
              activeResumesRef.current.delete(incompleteUpload.uploadId);
              const errorMessage = error.message || "";
              // If upload expired or was aborted, remove it from the list
              if (
                errorMessage.includes("expired") ||
                errorMessage.includes("aborted") ||
                errorMessage.includes("does not exist") ||
                errorMessage.includes("NoSuchUpload")
              ) {
                console.log(
                  `Upload ${incompleteUpload.uploadId} expired or was aborted, removing from list`
                );
                setIncompleteUploads((prev) =>
                  prev.filter((u) => u.uploadId !== incompleteUpload.uploadId)
                );
                // Clean up storage
                try {
                  fileStorageService.removeFile(incompleteUpload.uploadId);
                } catch (err) {
                  console.warn("Failed to clean up expired upload:", err);
                }
              } else {
                console.error(
                  `Failed to auto-resume upload ${incompleteUpload.uploadId}:`,
                  error
                );
              }
            });
        });
      } catch (error) {
        console.error("Failed to load incomplete uploads:", error);
      }
    };

    loadAndAutoResume();
  }, []); // Only run on mount

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setIsPaused(false);
    setError(null);

    const uploadService = createUploadService();
    uploadServiceRef.current = uploadService;

    try {
      const result = await uploadService.upload({
        file,
        onProgress: (progressData) => {
          setProgress(progressData);
          setIsPaused(progressData.status === "paused");
          if (progressData.error) {
            setError(progressData.error);
          }
        },
        concurrency: 3, // Upload one part at a time sequentially
      });

      return result;
    } catch (err: any) {
      setError(err.message || "Upload failed");
      throw err;
    } finally {
      setIsUploading(false);
      uploadServiceRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    uploadServiceRef.current?.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    uploadServiceRef.current?.resume();
    setIsPaused(false);
  }, []);

  const resumeUpload = useCallback(async (uploadId: string, file?: File) => {
    setIsUploading(true);
    setIsPaused(false);
    setError(null);

    const uploadService = createUploadService();
    uploadServiceRef.current = uploadService;

    try {
      // Resume from database - file will be retrieved from IndexedDB if not provided
      const result = await uploadService.resumeFromDatabase(
        uploadId,
        file, // Optional - will be retrieved from IndexedDB if not provided
        (progressData) => {
          setProgress(progressData);
          setIsPaused(progressData.status === "paused");
          if (progressData.error) {
            setError(progressData.error);
          }
          // Update incomplete uploads list
          setIncompleteUploads((prev) =>
            prev.map((u) =>
              u.uploadId === uploadId
                ? {
                    ...u,
                    progress: progressData.progress,
                    uploadedBytes: progressData.uploadedBytes,
                  }
                : u
            )
          );
        }
      );

      // Remove from incomplete uploads on completion
      setIncompleteUploads((prev) =>
        prev.filter((u) => u.uploadId !== uploadId)
      );

      return result;
    } catch (err: any) {
      const errorMessage = err.message || "";
      // If upload expired or was aborted, remove it from the list
      if (
        errorMessage.includes("expired") ||
        errorMessage.includes("aborted") ||
        errorMessage.includes("does not exist") ||
        errorMessage.includes("NoSuchUpload")
      ) {
        setIncompleteUploads((prev) =>
          prev.filter((u) => u.uploadId !== uploadId)
        );
        // Clean up storage
        try {
          await fileStorageService.removeFile(uploadId);
        } catch (cleanupError) {
          console.warn("Failed to clean up expired upload:", cleanupError);
        }
      }
      setError(errorMessage || "Resume failed");
      throw err;
    } finally {
      setIsUploading(false);
      uploadServiceRef.current = null;
    }
  }, []);

  const clearIncompleteUpload = useCallback(async (uploadId: string) => {
    try {
      // Remove file from IndexedDB (database handles state)
      await fileStorageService.removeFile(uploadId);
      setIncompleteUploads((prev) =>
        prev.filter((u) => u.uploadId !== uploadId)
      );
    } catch (error) {
      console.error("Failed to clear incomplete upload:", error);
    }
  }, []);

  const abort = useCallback(async () => {
    await uploadServiceRef.current?.abort();
    setIsUploading(false);
    setIsPaused(false);
    // Reload incomplete uploads from database after abort
    try {
      const response = await apiService.getIncompleteUploads();
      const incomplete: IncompleteUpload[] = response.uploads.map((upload) => ({
        uploadId: upload.uploadId,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        progress: upload.progress,
        uploadedBytes: upload.uploadedBytes,
      }));
      setIncompleteUploads(incomplete);
    } catch (err) {
      console.error("Failed to reload incomplete uploads:", err);
    }
  }, []);

  return {
    uploadFile,
    resumeUpload,
    pause,
    resume,
    abort,
    progress,
    isUploading,
    isPaused,
    error,
    incompleteUploads,
    clearIncompleteUpload,
  };
};
