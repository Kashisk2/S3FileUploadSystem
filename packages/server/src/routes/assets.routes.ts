import { Router, Request, Response } from "express";
import { assetService } from "../services/asset.service";
import { EntityType } from "@prisma/client";

const router = Router();

/**
 * GET /api/assets
 * List all assets with filters
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      entityType,
      entityId,
      workspaceId,
      projectId,
      userId,
      isDeleted,
      isArchived,
      page,
      limit,
      search,
    } = req.query;

    const result = await assetService.listAssets({
      entityType: entityType as EntityType,
      entityId: entityId as string,
      workspaceId: workspaceId as string,
      projectId: projectId as string,
      userId: userId as string,
      isDeleted: isDeleted === "true",
      isArchived:
        isArchived === "true"
          ? true
          : isArchived === "false"
          ? false
          : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50,
      search: search as string,
    });

    res.json(result);
  } catch (error) {
    console.error("Error listing assets:", error);
    res.status(500).json({ error: "Failed to list assets" });
  }
});

/**
 * GET /api/assets/stats
 * Get asset statistics
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const { workspaceId, projectId, userId } = req.query;

    const stats = await assetService.getAssetStats({
      workspaceId: workspaceId as string,
      projectId: projectId as string,
      userId: userId as string,
    });

    res.json(stats);
  } catch (error) {
    console.error("Error getting asset stats:", error);
    res.status(500).json({ error: "Failed to get asset stats" });
  }
});

/**
 * GET /api/assets/:id
 * Get asset by ID
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const asset = await assetService.getAssetById(id);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    res.json(asset);
  } catch (error) {
    console.error("Error getting asset:", error);
    res.status(500).json({ error: "Failed to get asset" });
  }
});

/**
 * GET /api/assets/:id/download
 * Get download URL for asset
 */
router.get("/:id/download", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { disposition } = req.query;

    const result = await assetService.getDownloadUrl(
      id,
      (disposition as "inline" | "attachment") || "attachment"
    );

    res.json(result);
  } catch (error: any) {
    console.error("Error getting download URL:", error);
    if (error.message === "Asset not found") {
      return res.status(404).json({ error: "Asset not found" });
    }
    res.status(500).json({ error: "Failed to get download URL" });
  }
});

/**
 * PATCH /api/assets/:id
 * Update asset
 */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, entityType, entityId, attributes, isArchived } = req.body;

    const asset = await assetService.updateAsset(id, {
      name,
      entityType,
      entityId,
      attributes,
      isArchived,
    });

    res.json(asset);
  } catch (error) {
    console.error("Error updating asset:", error);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

/**
 * DELETE /api/assets/:id
 * Delete asset (soft delete by default)
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { hard } = req.query;

    const result = await assetService.deleteAsset(id, hard === "true");

    res.json(result);
  } catch (error: any) {
    console.error("Error deleting asset:", error);
    if (error.message === "Asset not found") {
      return res.status(404).json({ error: "Asset not found" });
    }
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

/**
 * POST /api/assets/:id/restore
 * Restore soft-deleted asset
 */
router.post("/:id/restore", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const asset = await assetService.restoreAsset(id);

    res.json(asset);
  } catch (error) {
    console.error("Error restoring asset:", error);
    res.status(500).json({ error: "Failed to restore asset" });
  }
});

/**
 * POST /api/assets/:id/duplicate
 * Duplicate an asset
 */
router.post("/:id/duplicate", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { entityId } = req.body;

    const asset = await assetService.duplicateAsset(id, entityId);

    res.json(asset);
  } catch (error: any) {
    console.error("Error duplicating asset:", error);
    if (error.message === "Asset not found") {
      return res.status(404).json({ error: "Asset not found" });
    }
    res.status(500).json({ error: "Failed to duplicate asset" });
  }
});

/**
 * POST /api/assets/bulk-delete
 * Bulk delete assets
 */
router.post("/bulk-delete", async (req: Request, res: Response) => {
  try {
    const { ids, hard } = req.body;

    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "ids array is required" });
    }

    const results = await Promise.allSettled(
      ids.map((id: string) => assetService.deleteAsset(id, hard === true))
    );

    const deleted = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    res.json({ deleted, failed, total: ids.length });
  } catch (error) {
    console.error("Error bulk deleting assets:", error);
    res.status(500).json({ error: "Failed to bulk delete assets" });
  }
});

export default router;
