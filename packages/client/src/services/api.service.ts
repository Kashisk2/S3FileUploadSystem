import axios from "axios";
import type {
  InitiateUploadResponse,
  PresignedUrlsResponse,
  CompletedPart,
  CompleteUploadResponse,
  ListFilesResponse,
} from "../types";

const API_BASE_URL = "/api";

export const apiService = {
  /**
   * Initiate a multipart upload
   */
  async initiateUpload(
    fileName: string,
    fileSize: number,
    fileType: string
  ): Promise<InitiateUploadResponse> {
    const response = await axios.post(`${API_BASE_URL}/upload/initiate`, {
      fileName,
      fileSize,
      fileType,
    });
    return response.data;
  },

  /**
   * Get presigned URLs for uploading parts (batch)
   */
  async getPresignedUrls(
    uploadId: string,
    fileKey: string,
    partNumbers: number[]
  ): Promise<PresignedUrlsResponse> {
    const response = await axios.post(`${API_BASE_URL}/upload/presigned-urls`, {
      uploadId,
      fileKey,
      partNumbers,
    });
    return response.data;
  },

  /**
   * Upload a chunk directly to S3 using presigned URL
   */
  async uploadChunk(
    presignedUrl: string,
    chunk: Blob,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const response = await axios.put(presignedUrl, chunk, {
      headers: {
        "Content-Type": "application/octet-stream",
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(progress);
        }
      },
    });

    // Extract ETag from response headers
    const etag = response.headers["etag"] || response.headers["ETag"];
    return etag?.replace(/"/g, "") || "";
  },

  /**
   * Complete the multipart upload
   */
  async completeUpload(
    uploadId: string,
    fileKey: string,
    parts: CompletedPart[]
  ): Promise<CompleteUploadResponse> {
    const response = await axios.post(`${API_BASE_URL}/upload/complete`, {
      uploadId,
      fileKey,
      parts,
    });
    return response.data;
  },

  /**
   * Abort a multipart upload
   */
  async abortUpload(uploadId: string, fileKey: string): Promise<void> {
    await axios.post(`${API_BASE_URL}/upload/abort`, {
      uploadId,
      fileKey,
    });
  },

  /**
   * Get upload status
   */
  async getUploadStatus(uploadId: string): Promise<any> {
    const response = await axios.get(
      `${API_BASE_URL}/upload/status/${uploadId}`
    );
    return response.data;
  },

  /**
   * Get resume info for an upload
   */
  async getResumeInfo(uploadId: string): Promise<any> {
    const response = await axios.get(
      `${API_BASE_URL}/upload/resume/${uploadId}`
    );
    return response.data;
  },

  /**
   * List all files
   */
  async listFiles(
    prefix?: string,
    continuationToken?: string
  ): Promise<ListFilesResponse> {
    const params = new URLSearchParams();
    if (prefix) params.append("prefix", prefix);
    if (continuationToken)
      params.append("continuationToken", continuationToken);

    const response = await axios.get(
      `${API_BASE_URL}/files?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get download URL for a file
   */
  async getDownloadUrl(
    fileKey: string,
    fileName?: string
  ): Promise<{ downloadUrl: string }> {
    const response = await axios.post(`${API_BASE_URL}/files/download-url`, {
      fileKey,
      fileName,
      disposition: "attachment",
    });
    return response.data;
  },

  /**
   * Delete a file
   */
  async deleteFile(fileKey: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/files/${encodeURIComponent(fileKey)}`);
  },
};
