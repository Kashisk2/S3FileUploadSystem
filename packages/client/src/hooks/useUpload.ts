import { useState, useCallback, useRef } from "react";
import { UploadService, createUploadService } from "../services/upload.service";
import type { UploadProgress } from "../types";

interface UseUploadReturn {
  uploadFile: (file: File) => Promise<{ fileUrl: string; fileKey: string }>;
  pause: () => void;
  resume: () => void;
  abort: () => Promise<void>;
  progress: UploadProgress | null;
  isUploading: boolean;
  isPaused: boolean;
  error: string | null;
}

export const useUpload = (): UseUploadReturn => {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadServiceRef = useRef<UploadService | null>(null);

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
        concurrency: 3,
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

  const abort = useCallback(async () => {
    await uploadServiceRef.current?.abort();
    setIsUploading(false);
    setIsPaused(false);
  }, []);

  return {
    uploadFile,
    pause,
    resume,
    abort,
    progress,
    isUploading,
    isPaused,
    error,
  };
};
