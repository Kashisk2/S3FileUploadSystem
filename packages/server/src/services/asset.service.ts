import prisma from "../db/prisma";
import { EntityType, UploadStatus } from "@prisma/client";
import { s3Service } from "./s3.service";
import { config } from "../config";

export interface CreateAssetInput {
  name: string;
  key: string;
  size: number;
  mimeType: string;
  etag?: string;
  entityType?: EntityType;
  entityId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  attributes?: Record<string, any>;
}

export interface UpdateAssetInput {
  name?: string;
  entityType?: EntityType;
  entityId?: string;
  attributes?: Record<string, any>;
  isArchived?: boolean;
}

export interface AssetQueryParams {
  entityType?: EntityType;
  entityId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  isDeleted?: boolean;
  isArchived?: boolean;
  uploadStatus?: UploadStatus;
  page?: number;
  limit?: number;
  search?: string;
}

class AssetService {
  /**
   * Create a new file asset record
   */
  async createAsset(input: CreateAssetInput) {
    const asset = await prisma.fileAsset.create({
      data: {
        name: input.name,
        key: input.key,
        size: BigInt(input.size),
        mimeType: input.mimeType,
        bucket: config.aws.bucketName,
        etag: input.etag,
        entityType: input.entityType || EntityType.GENERAL,
        entityId: input.entityId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        userId: input.userId,
        attributes: input.attributes || {},
        uploadStatus: UploadStatus.COMPLETED,
      },
    });

    return this.serializeAsset(asset);
  }

  /**
   * Create asset from completed upload
   */
  async createAssetFromUpload(uploadId: string, etag: string, userId?: string) {
    // Get upload session
    const session = await prisma.uploadSession.findUnique({
      where: { uploadId },
    });

    if (!session) {
      throw new Error("Upload session not found");
    }

    // Create the file asset
    const asset = await prisma.fileAsset.create({
      data: {
        name: session.fileName,
        key: session.fileKey,
        size: session.fileSize,
        mimeType: session.fileType,
        bucket: session.bucket,
        etag,
        entityType: session.entityType,
        entityId: session.entityId,
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        userId: userId || session.userId,
        uploadId: session.uploadId,
        uploadStatus: UploadStatus.COMPLETED,
        totalChunks: session.totalChunks,
        completedChunks: session.totalChunks,
      },
    });

    // Update upload session status
    await prisma.uploadSession.update({
      where: { uploadId },
      data: { status: UploadStatus.COMPLETED },
    });

    return this.serializeAsset(asset);
  }

  /**
   * Get asset by ID
   */
  async getAssetById(id: string) {
    const asset = await prisma.fileAsset.findUnique({
      where: { id },
    });

    if (!asset) return null;
    return this.serializeAsset(asset);
  }

  /**
   * Get asset by S3 key
   */
  async getAssetByKey(key: string) {
    const asset = await prisma.fileAsset.findUnique({
      where: { key },
    });

    if (!asset) return null;
    return this.serializeAsset(asset);
  }

  /**
   * List assets with filters
   */
  async listAssets(params: AssetQueryParams) {
    const {
      entityType,
      entityId,
      workspaceId,
      projectId,
      userId,
      isDeleted = false,
      isArchived,
      uploadStatus,
      page = 1,
      limit = 50,
      search,
    } = params;

    const where: any = {
      isDeleted,
    };

    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (workspaceId) where.workspaceId = workspaceId;
    if (projectId) where.projectId = projectId;
    if (userId) where.userId = userId;
    if (isArchived !== undefined) where.isArchived = isArchived;
    if (uploadStatus) where.uploadStatus = uploadStatus;
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [assets, total] = await Promise.all([
      prisma.fileAsset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fileAsset.count({ where }),
    ]);

    return {
      assets: assets.map(this.serializeAsset),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update asset
   */
  async updateAsset(id: string, input: UpdateAssetInput) {
    const asset = await prisma.fileAsset.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.entityType && { entityType: input.entityType }),
        ...(input.entityId && { entityId: input.entityId }),
        ...(input.attributes && { attributes: input.attributes }),
        ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
      },
    });

    return this.serializeAsset(asset);
  }

  /**
   * Soft delete asset
   */
  async deleteAsset(id: string, hardDelete = false) {
    const asset = await prisma.fileAsset.findUnique({
      where: { id },
    });

    if (!asset) {
      throw new Error("Asset not found");
    }

    if (hardDelete) {
      // Delete from S3
      await s3Service.deleteFile(asset.key);

      // Delete from database
      await prisma.fileAsset.delete({
        where: { id },
      });

      return { deleted: true };
    }

    // Soft delete
    await prisma.fileAsset.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return { deleted: true, softDelete: true };
  }

  /**
   * Restore soft-deleted asset
   */
  async restoreAsset(id: string) {
    const asset = await prisma.fileAsset.update({
      where: { id },
      data: {
        isDeleted: false,
        deletedAt: null,
      },
    });

    return this.serializeAsset(asset);
  }

  /**
   * Get download URL for asset
   */
  async getDownloadUrl(
    id: string,
    disposition: "inline" | "attachment" = "attachment"
  ) {
    const asset = await prisma.fileAsset.findUnique({
      where: { id },
    });

    if (!asset || asset.isDeleted) {
      throw new Error("Asset not found");
    }

    const url = await s3Service.getPresignedDownloadUrl(
      asset.key,
      asset.name,
      disposition
    );

    return {
      url,
      expiresIn: config.upload.presignedUrlExpiry,
    };
  }

  /**
   * Duplicate an asset
   */
  async duplicateAsset(id: string, newEntityId?: string) {
    const original = await prisma.fileAsset.findUnique({
      where: { id },
    });

    if (!original) {
      throw new Error("Asset not found");
    }

    // TODO: Copy S3 object if needed
    // For now, just create a new reference

    const duplicate = await prisma.fileAsset.create({
      data: {
        name: original.name,
        key: original.key, // Same S3 object
        size: original.size,
        mimeType: original.mimeType,
        bucket: original.bucket,
        etag: original.etag,
        entityType: original.entityType,
        entityId: newEntityId || original.entityId,
        workspaceId: original.workspaceId,
        projectId: original.projectId,
        userId: original.userId,
        attributes: original.attributes as any,
        uploadStatus: UploadStatus.COMPLETED,
      },
    });

    return this.serializeAsset(duplicate);
  }

  /**
   * Get asset statistics
   */
  async getAssetStats(params: {
    workspaceId?: string;
    projectId?: string;
    userId?: string;
  }) {
    const where: any = { isDeleted: false };
    if (params.workspaceId) where.workspaceId = params.workspaceId;
    if (params.projectId) where.projectId = params.projectId;
    if (params.userId) where.userId = params.userId;

    const [totalAssets, totalSize, byType] = await Promise.all([
      prisma.fileAsset.count({ where }),
      prisma.fileAsset.aggregate({
        where,
        _sum: { size: true },
      }),
      prisma.fileAsset.groupBy({
        by: ["entityType"],
        where,
        _count: true,
        _sum: { size: true },
      }),
    ]);

    return {
      totalAssets,
      totalSize: Number(totalSize._sum.size || 0),
      byType: byType.map((item) => ({
        type: item.entityType,
        count: item._count,
        size: Number(item._sum.size || 0),
      })),
    };
  }

  /**
   * Serialize asset for API response (convert BigInt to number)
   */
  private serializeAsset(asset: any) {
    return {
      ...asset,
      size: Number(asset.size),
      // Generate asset URL
      assetUrl: `/api/assets/${asset.id}/download`,
    };
  }
}

export const assetService = new AssetService();
