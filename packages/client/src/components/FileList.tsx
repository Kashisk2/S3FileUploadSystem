import React, {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  Download,
  Trash2,
  RefreshCw,
  ChevronRight,
  FileIcon,
  Eye,
} from "lucide-react";
import { apiService } from "../services/api.service";
import type { Asset } from "../types";
import { formatBytes, formatDate, getFileIcon } from "../utils/format";
import { FilePreview } from "./FilePreview";

interface FileListProps {
  onRefresh?: () => void;
}

export interface FileListRef {
  refresh: () => void;
}

export const FileList = forwardRef<FileListRef, FileListProps>(
  ({ onRefresh }, ref) => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [pagination, setPagination] = useState({
      page: 1,
      limit: 50,
      total: 0,
      totalPages: 0,
    });

    const fetchAssets = useCallback(async (page: number = 1) => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiService.listAssets({
          page,
          limit: 50,
          isDeleted: false,
        });

        if (page === 1) {
          setAssets(response.assets);
        } else {
          setAssets((prev) => [...prev, ...response.assets]);
        }

        setPagination(response.pagination);
        setCurrentPage(page);
      } catch (err: any) {
        setError(err.message || "Failed to load files");
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      fetchAssets(1);
    }, [fetchAssets]);

    const handleRefresh = useCallback(() => {
      setCurrentPage(1);
      fetchAssets(1);
      onRefresh?.();
    }, [fetchAssets, onRefresh]);

    // Expose refresh method via ref
    useImperativeHandle(
      ref,
      () => ({
        refresh: handleRefresh,
      }),
      [handleRefresh]
    );

    const handleLoadMore = useCallback(() => {
      if (currentPage < pagination.totalPages) {
        fetchAssets(currentPage + 1);
      }
    }, [currentPage, pagination.totalPages, fetchAssets]);

    // All files can be previewed
    const handleView = (asset: Asset, e?: React.MouseEvent) => {
      e?.stopPropagation(); // Prevent event bubbling
      e?.preventDefault();
      console.log(
        "[FileList] Opening preview for:",
        asset.name,
        asset.mimeType
      );
      setPreviewAsset(asset);
    };

    const handleDownload = async (asset: Asset) => {
      try {
        const { downloadUrl } = await apiService.getAssetDownloadUrl(
          asset.id,
          "attachment"
        );
        // Create a temporary link and trigger download
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = asset.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err: any) {
        alert("Failed to download file: " + (err.message || "Unknown error"));
      }
    };

    const handleDelete = async (asset: Asset) => {
      if (!confirm("Are you sure you want to delete this file?")) return;

      try {
        await apiService.deleteAsset(asset.id, false); // Soft delete
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      } catch (err: any) {
        alert("Failed to delete file: " + (err.message || "Unknown error"));
      }
    };

    return (
      <div className="bg-white rounded-lg shadow-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Uploaded Files
          </h2>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="divide-y">
          {assets.length === 0 && !loading && (
            <div className="p-8 text-center text-gray-500">
              <FileIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No files uploaded yet</p>
            </div>
          )}

          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="text-2xl">{getFileIcon(asset.name)}</div>

              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleView(asset, e);
                }}
                title={asset ? "Click to preview" : "Click to download"}
              >
                <h3 className="font-medium text-gray-900 truncate hover:text-blue-600">
                  {asset.name}
                </h3>
                <div className="flex gap-4 text-sm text-gray-500">
                  <span>{formatBytes(asset.size)}</span>
                  <span>{formatDate(new Date(asset.createdAt))}</span>
                  {asset.mimeType && (
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                      {asset.mimeType}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleView(asset, e);
                  }}
                  className="p-2 rounded-lg hover:bg-green-100 text-green-600 transition-colors"
                  title="Preview"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(asset);
                  }}
                  className="p-2 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(asset);
                  }}
                  className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {currentPage < pagination.totalPages && (
          <div className="p-4 border-t">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
            >
              Load More ({pagination.total - assets.length} remaining)
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading && assets.length > 0 && (
          <div className="p-4 border-t text-center text-gray-500">
            Loading...
          </div>
        )}
        {/* File Preview Modal */}
        {previewAsset && (
          <FilePreview
            asset={previewAsset}
            onClose={() => setPreviewAsset(null)}
          />
        )}
      </div>
    );
  }
);
