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
      requestHandler: {
        requestTimeout: 10000, // 10 seconds timeout
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
   * Verifies parts exist in S3 before completing
   */
  async completeMultipartUpload(
    uploadId: string,
    fileKey: string,
    parts: CompletedPart[]
  ): Promise<CompleteUploadResponse> {
    console.log(
      `[completeMultipartUpload] Starting completion for uploadId: ${uploadId}, fileKey: ${fileKey}, parts: ${parts.length}`
    );

    // First, verify the upload exists and get actual uploaded parts from S3
    let actualUploadedParts: {
      partNumber: number;
      etag: string;
      size: number;
    }[];
    try {
      console.log(
        `[completeMultipartUpload] Attempting to list uploaded parts for uploadId: ${uploadId}`
      );
      // Add timeout wrapper to prevent hanging
      const listPartsPromise = this.listUploadedParts(uploadId, fileKey);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("ListParts timeout after 15 seconds")),
          15000
        );
      });

      actualUploadedParts = (await Promise.race([
        listPartsPromise,
        timeoutPromise,
      ])) as typeof actualUploadedParts;
      console.log(
        `[completeMultipartUpload] Successfully listed ${actualUploadedParts.length} parts from S3`
      );
    } catch (error: any) {
      console.log(
        `[completeMultipartUpload] Error listing parts:`,
        error.name || error.Code || error.message
      );
      // If upload doesn't exist, it might already be completed
      const isNoSuchUpload =
        error.name === "NoSuchUpload" ||
        error.Code === "NoSuchUpload" ||
        error.message?.includes("NoSuchUpload") ||
        (error.$metadata && error.$metadata.httpStatusCode === 404);

      if (isNoSuchUpload) {
        console.log(
          `Upload ${uploadId} not found in S3 (NoSuchUpload), checking if file already exists...`
        );
        // Check if file already exists (upload was already completed)
        try {
          const headResponse = await this.client.send(
            new HeadObjectCommand({
              Bucket: this.bucket,
              Key: fileKey,
            })
          );
          // File exists, upload was already completed - return success
          console.log(
            `Upload ${uploadId} already completed, file exists in S3`
          );
          return {
            fileUrl:
              config.aws.endpoint ||
              `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${fileKey}`,
            fileKey,
            etag: headResponse.ETag?.replace(/"/g, "") || "",
          };
        } catch (headError: any) {
          // File doesn't exist - upload was aborted, expired, or never completed
          console.warn(
            `Upload ${uploadId} does not exist and file ${fileKey} not found. Upload may have expired or been aborted.`
          );
          // If we have parts from client, try to complete with those parts anyway
          // This handles race conditions where S3 hasn't fully registered the upload yet
          if (parts.length > 0) {
            console.log(
              `Attempting to complete upload with ${parts.length} parts from client (fallback)...`
            );
            // Try to complete with client parts - S3 might accept it if upload just completed
            const partsToComplete = parts
              .map((p) => ({
                PartNumber: p.partNumber,
                ETag: p.etag,
              }))
              .sort((a, b) => a.PartNumber - b.PartNumber);

            try {
              const command = new CompleteMultipartUploadCommand({
                Bucket: this.bucket,
                Key: fileKey,
                UploadId: uploadId,
                MultipartUpload: {
                  Parts: partsToComplete,
                },
              });

              const response = await this.client.send(command);
              console.log(
                `Successfully completed upload with client parts (fallback)`
              );
              return {
                fileUrl:
                  response.Location ||
                  config.aws.endpoint ||
                  `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${fileKey}`,
                fileKey,
                etag: response.ETag?.replace(/"/g, "") || "",
              };
            } catch (completeError: any) {
              // If completion also fails, the upload is definitely gone
              console.error(
                `Failed to complete upload with client parts:`,
                completeError.message || completeError
              );
              throw new Error(
                `Upload session expired or was aborted. Please start a new upload.`
              );
            }
          }
          throw new Error(
            `Upload ${uploadId} does not exist. It may have been aborted, expired, or already completed.`
          );
        }
      }
      // Re-throw if it's not a NoSuchUpload error
      console.error(`Error listing uploaded parts:`, error);
      throw error;
    }

    // Verify all parts from client exist in S3
    const actualPartNumbers = new Set(
      actualUploadedParts.map((p) => p.partNumber)
    );
    const clientPartNumbers = new Set(parts.map((p) => p.partNumber));

    console.log(
      `[completeMultipartUpload] S3 has ${actualUploadedParts.length} parts:`,
      Array.from(actualPartNumbers).sort()
    );
    console.log(
      `[completeMultipartUpload] Client sent ${parts.length} parts:`,
      Array.from(clientPartNumbers).sort()
    );

    // Check if any client parts don't exist in S3
    const missingParts: number[] = [];
    for (const part of parts) {
      if (!actualPartNumbers.has(part.partNumber)) {
        missingParts.push(part.partNumber);
      }
    }

    if (missingParts.length > 0) {
      // If S3 has more parts than client sent, that's okay - we'll use S3's parts
      // Only error if client claims parts exist that don't
      if (actualUploadedParts.length < parts.length) {
        throw new Error(
          `Parts ${missingParts.join(
            ", "
          )} do not exist in S3. Upload may have been interrupted.`
        );
      }
      // Otherwise, we'll use all parts from S3 (which is more reliable)
      console.warn(
        `Client sent parts ${missingParts.join(
          ", "
        )} that don't exist in S3, but S3 has ${
          actualUploadedParts.length
        } parts. Using all S3 parts.`
      );
    }

    // Use ALL parts from S3 (they're the source of truth)
    // This handles cases where:
    // 1. Client tracking is incomplete but all parts are uploaded
    // 2. Client sent partial parts list but S3 has all parts
    // 3. Edge cases where chunk count doesn't match but bytes are complete
    const partsToComplete = actualUploadedParts
      .map((actualPart) => {
        // Try to use client ETag if available (more reliable), otherwise use S3 ETag
        const clientPart = parts.find(
          (p) => p.partNumber === actualPart.partNumber
        );
        return {
          PartNumber: actualPart.partNumber,
          ETag: clientPart?.etag || actualPart.etag,
        };
      })
      .sort((a, b) => a.PartNumber - b.PartNumber);

    if (partsToComplete.length === 0) {
      throw new Error("No valid parts found to complete the upload");
    }

    console.log(
      `[completeMultipartUpload] Completing upload with ${partsToComplete.length} parts (using all parts from S3)`
    );

    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: fileKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: partsToComplete,
      },
    });

    let response;
    try {
      console.log(
        `[completeMultipartUpload] Sending CompleteMultipartUploadCommand to S3...`
      );
      response = await this.client.send(command);
      console.log(
        `[completeMultipartUpload] Successfully completed upload, response received`
      );
    } catch (error: any) {
      console.error(
        `[completeMultipartUpload] Error completing upload:`,
        error.name || error.Code || error.message
      );
      // If completion fails, provide more context
      if (error.name === "NoSuchUpload" || error.Code === "NoSuchUpload") {
        throw new Error(
          `Upload ${uploadId} no longer exists. It may have been completed, aborted, or expired.`
        );
      }
      throw error;
    }

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
    console.log(
      `[listUploadedParts] Listing parts for uploadId: ${uploadId}, fileKey: ${fileKey}`
    );
    const parts: { partNumber: number; etag: string; size: number }[] = [];
    let partNumberMarker: number | undefined;
    const seenMarkers = new Set<number | undefined>(); // Track seen markers to prevent infinite loops
    let iterationCount = 0;
    const maxIterations = 1000; // Safety limit

    do {
      // Safety check to prevent infinite loops
      if (iterationCount >= maxIterations) {
        console.error(
          `[listUploadedParts] Max iterations reached (${maxIterations}), breaking loop`
        );
        break;
      }

      // Check if we've seen this marker before (infinite loop detection)
      if (seenMarkers.has(partNumberMarker)) {
        console.warn(
          `[listUploadedParts] Detected loop with marker ${partNumberMarker}, breaking`
        );
        break;
      }
      seenMarkers.add(partNumberMarker);

      const command = new ListPartsCommand({
        Bucket: this.bucket,
        Key: fileKey,
        UploadId: uploadId,
        PartNumberMarker: partNumberMarker,
      });

      console.log(
        `[listUploadedParts] Sending ListPartsCommand to S3 (marker: ${
          partNumberMarker || "none"
        }), iteration: ${iterationCount + 1}`
      );
      const response = await this.client.send(command);
      console.log(
        `[listUploadedParts] Received response, parts: ${
          response.Parts?.length || 0
        }, nextMarker: ${response.NextPartNumberMarker || "none"}`
      );

      if (response.Parts && response.Parts.length > 0) {
        parts.push(
          ...response.Parts.map((part) => ({
            partNumber: part.PartNumber!,
            etag: part.ETag!,
            size: part.Size!,
          }))
        );
      }

      // Check if we should continue
      const hasMoreParts = response.Parts && response.Parts.length > 0;
      const hasNextMarker = response.NextPartNumberMarker !== undefined;

      // Stop if we got 0 parts (even if there's a next marker, it's likely a bug)
      if (!hasMoreParts) {
        console.log(
          `[listUploadedParts] Got 0 parts, stopping (nextMarker: ${
            response.NextPartNumberMarker || "none"
          })`
        );
        break;
      }

      // Stop if there's no next marker
      if (!hasNextMarker) {
        console.log(`[listUploadedParts] No next marker, stopping`);
        break;
      }

      // Update marker for next iteration
      partNumberMarker = response.NextPartNumberMarker;
      iterationCount++;
    } while (true); // Changed to true since we break explicitly

    console.log(
      `[listUploadedParts] Total parts found: ${parts.length} after ${iterationCount} iterations`
    );
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
    disposition: "inline" | "attachment" = "attachment",
    contentType?: string
  ): Promise<string> {
    // For inline disposition, don't include filename to allow browser to display
    // For attachment, include filename to trigger download
    const responseContentDisposition =
      disposition === "inline"
        ? "inline" // Just "inline" without filename for better browser support
        : fileName
        ? `attachment; filename="${encodeURIComponent(fileName)}"`
        : "attachment";

    const commandParams: any = {
      Bucket: this.bucket,
      Key: fileKey,
      ResponseContentDisposition: responseContentDisposition,
    };

    // Add ContentType if provided (helps browser display inline content)
    if (contentType) {
      commandParams.ResponseContentType = contentType;
    }

    const command = new GetObjectCommand(commandParams);

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
