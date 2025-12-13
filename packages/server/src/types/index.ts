export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface InitiateUploadRequest {
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface InitiateUploadResponse {
  uploadId: string;
  fileKey: string;
  chunkSize: number;
  totalChunks: number;
}

export interface GetPresignedUrlRequest {
  uploadId: string;
  fileKey: string;
  partNumber: number;
}

export interface GetPresignedUrlResponse {
  presignedUrl: string;
  partNumber: number;
}

export interface GetPresignedUrlsRequest {
  uploadId: string;
  fileKey: string;
  partNumbers: number[];
}

export interface GetPresignedUrlsResponse {
  presignedUrls: { partNumber: number; url: string }[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface CompleteUploadRequest {
  uploadId: string;
  fileKey: string;
  parts: CompletedPart[];
}

export interface CompleteUploadResponse {
  fileUrl: string;
  fileKey: string;
  etag: string;
}

export interface AbortUploadRequest {
  uploadId: string;
  fileKey: string;
}

export interface UploadStatus {
  uploadId: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  completedParts: number[];
  totalChunks: number;
  status: "pending" | "uploading" | "completed" | "failed" | "aborted";
  createdAt: Date;
  updatedAt: Date;
}

export interface ListFilesResponse {
  files: {
    key: string;
    size: number;
    lastModified: Date;
    etag: string;
  }[];
  nextContinuationToken?: string;
}

export interface GetDownloadUrlRequest {
  fileKey: string;
  fileName?: string;
  disposition?: "inline" | "attachment";
}

export interface GetDownloadUrlResponse {
  downloadUrl: string;
  expiresIn: number;
}
