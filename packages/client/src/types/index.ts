export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface InitiateUploadResponse {
  uploadId: string;
  fileKey: string;
  chunkSize: number;
  totalChunks: number;
}

export interface PresignedUrlResponse {
  presignedUrl: string;
  partNumber: number;
}

export interface PresignedUrlsResponse {
  presignedUrls: { partNumber: number; url: string }[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface CompleteUploadResponse {
  fileUrl: string;
  fileKey: string;
  etag: string;
}

export interface UploadProgress {
  uploadId: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  status:
    | "pending"
    | "uploading"
    | "completed"
    | "failed"
    | "paused"
    | "aborted";
  progress: number; // 0-100
  uploadedBytes: number;
  totalChunks: number;
  completedChunks: number;
  speed: number; // bytes per second
  remainingTime: number; // seconds
  error?: string;
}

export interface FileItem {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

export interface ListFilesResponse {
  files: FileItem[];
  nextContinuationToken?: string;
}
