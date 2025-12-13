import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import type {
  InitiateUploadRequest,
  InitiateUploadResponse,
  CompletedPart,
  CompleteUploadResponse,
  ListFilesResponse,
} from "../types";

class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const s3Config: any = {
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    };

    // For MinIO or custom S3-compatible storage
    if (config.aws.endpoint) {
      s3Config.endpoint = config.aws.endpoint;
      s3Config.forcePathStyle = true;
    }

    this.client = new S3Client(s3Config);
    this.bucket = config.aws.bucketName;
  }

  /**
   * Generate a unique file key with folder structure
   */
  private generateFileKey(fileName: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const uniqueId = uuidv4();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `uploads/${year}/${month}/${uniqueId}-${sanitizedFileName}`;
  }

  /**
   * Calculate number of chunks based on file size
   */
  private calculateChunks(fileSize: number): {
    chunkSize: number;
    totalChunks: number;
  } {
    const chunkSize = config.upload.chunkSize;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    return { chunkSize, totalChunks };
  }

  /**
   * Initiate a multipart upload
   */
  async initiateMultipartUpload(
    request: InitiateUploadRequest
  ): Promise<InitiateUploadResponse> {
    const fileKey = this.generateFileKey(request.fileName);
    const { chunkSize, totalChunks } = this.calculateChunks(request.fileSize);

    // Encode filename for safe use in HTTP headers (Base64)
    const encodedFileName = Buffer.from(request.fileName).toString("base64");

    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: request.fileType,
      Metadata: {
        "original-filename-base64": encodedFileName,
        "file-size": String(request.fileSize),
      },
    });

    const response = await this.client.send(command);

    if (!response.UploadId) {
      throw new Error("Failed to initiate multipart upload");
    }

    return {
      uploadId: response.UploadId,
      fileKey,
      chunkSize,
      totalChunks,
    };
  }

  /**
   * Generate presigned URL for uploading a part
   */
  async getPresignedUploadUrl(
    uploadId: string,
    fileKey: string,
    partNumber: number
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: fileKey,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    const presignedUrl = await getSignedUrl(this.client, command, {
      expiresIn: config.upload.presignedUrlExpiry,
    });

    return presignedUrl;
  }

  /**
   * Generate presigned URLs for multiple parts (batch)
   */
  async getPresignedUploadUrls(
    uploadId: string,
    fileKey: string,
    partNumbers: number[]
  ): Promise<{ partNumber: number; url: string }[]> {
    const urlPromises = partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await this.getPresignedUploadUrl(uploadId, fileKey, partNumber),
    }));

    return Promise.all(urlPromises);
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    uploadId: string,
    fileKey: string,
    parts: CompletedPart[]
  ): Promise<CompleteUploadResponse> {
    // Sort parts by part number
    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: fileKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    });

    const response = await this.client.send(command);

    return {
      fileUrl:
        response.Location ||
        `${
          config.aws.endpoint ||
          `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com`
        }/${fileKey}`,
      fileKey,
      etag: response.ETag || "",
    };
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(uploadId: string, fileKey: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: fileKey,
      UploadId: uploadId,
    });

    await this.client.send(command);
  }

  /**
   * List uploaded parts (for resume functionality)
   */
  async listUploadedParts(
    uploadId: string,
    fileKey: string
  ): Promise<{ partNumber: number; etag: string; size: number }[]> {
    const parts: { partNumber: number; etag: string; size: number }[] = [];
    let partNumberMarker: number | undefined;

    do {
      const command = new ListPartsCommand({
        Bucket: this.bucket,
        Key: fileKey,
        UploadId: uploadId,
        PartNumberMarker: partNumberMarker,
      });

      const response = await this.client.send(command);

      if (response.Parts) {
        parts.push(
          ...response.Parts.map((part) => ({
            partNumber: part.PartNumber!,
            etag: part.ETag!,
            size: part.Size!,
          }))
        );
      }

      partNumberMarker = response.NextPartNumberMarker;
    } while (partNumberMarker);

    return parts;
  }

  /**
   * List files in the bucket
   */
  async listFiles(
    prefix?: string,
    continuationToken?: string,
    maxKeys = 100
  ): Promise<ListFilesResponse> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix || "uploads/",
      ContinuationToken: continuationToken,
      MaxKeys: maxKeys,
    });

    const response = await this.client.send(command);

    return {
      files:
        response.Contents?.map((file) => ({
          key: file.Key!,
          size: file.Size!,
          lastModified: file.LastModified!,
          etag: file.ETag!,
        })) || [],
      nextContinuationToken: response.NextContinuationToken,
    };
  }

  /**
   * Generate presigned download URL
   */
  async getPresignedDownloadUrl(
    fileKey: string,
    fileName?: string,
    disposition: "inline" | "attachment" = "attachment"
  ): Promise<string> {
    const responseContentDisposition = fileName
      ? `${disposition}; filename="${encodeURIComponent(fileName)}"`
      : disposition;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ResponseContentDisposition: responseContentDisposition,
    });

    const presignedUrl = await getSignedUrl(this.client, command, {
      expiresIn: config.upload.presignedUrlExpiry,
    });

    return presignedUrl;
  }

  /**
   * Delete a file
   */
  async deleteFile(fileKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });

    await this.client.send(command);
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileKey: string): Promise<{
    contentType: string;
    contentLength: number;
    lastModified: Date;
    etag: string;
    metadata: Record<string, string>;
  } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      const response = await this.client.send(command);

      return {
        contentType: response.ContentType || "application/octet-stream",
        contentLength: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || "",
        metadata: response.Metadata || {},
      };
    } catch (error: any) {
      if (error.name === "NotFound") {
        return null;
      }
      throw error;
    }
  }
}

export const s3Service = new S3Service();
