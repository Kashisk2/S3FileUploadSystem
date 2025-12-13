import React, { useState, useEffect, useCallback } from "react";
import {
  Download,
  Trash2,
  RefreshCw,
  ChevronRight,
  FileIcon,
} from "lucide-react";
import { apiService } from "../services/api.service";
import type { FileItem } from "../types";
import { formatBytes, formatDate, getFileIcon } from "../utils/format";

interface FileListProps {
  onRefresh?: () => void;
}

export const FileList: React.FC<FileListProps> = ({ onRefresh }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continuationToken, setContinuationToken] = useState<
    string | undefined
  >();
  const [hasMore, setHasMore] = useState(false);

  const fetchFiles = useCallback(async (token?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.listFiles(undefined, token);

      if (token) {
        setFiles((prev) => [...prev, ...response.files]);
      } else {
        setFiles(response.files);
      }

      setContinuationToken(response.nextContinuationToken);
      setHasMore(!!response.nextContinuationToken);
    } catch (err: any) {
      setError(err.message || "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleRefresh = useCallback(() => {
    setContinuationToken(undefined);
    fetchFiles();
    onRefresh?.();
  }, [fetchFiles, onRefresh]);

  const handleLoadMore = useCallback(() => {
    if (continuationToken) {
      fetchFiles(continuationToken);
    }
  }, [continuationToken, fetchFiles]);

  const handleDownload = async (file: FileItem) => {
    try {
      const fileName = file.key.split("/").pop() || "download";
      const { downloadUrl } = await apiService.getDownloadUrl(
        file.key,
        fileName
      );
      window.open(downloadUrl, "_blank");
    } catch (err: any) {
      alert("Failed to download file: " + (err.message || "Unknown error"));
    }
  };

  const handleDelete = async (file: FileItem) => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    try {
      await apiService.deleteFile(file.key);
      setFiles((prev) => prev.filter((f) => f.key !== file.key));
    } catch (err: any) {
      alert("Failed to delete file: " + (err.message || "Unknown error"));
    }
  };

  const getFileName = (key: string) => {
    const parts = key.split("/");
    const fullName = parts.pop() || key;
    // Remove UUID prefix if present
    const match = fullName.match(/^[a-f0-9]+-(.+)$/i);
    return match ? match[1] : fullName;
  };

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold text-gray-900">Uploaded Files</h2>
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
        {files.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            <FileIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No files uploaded yet</p>
          </div>
        )}

        {files.map((file) => (
          <div
            key={file.key}
            className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="text-2xl">{getFileIcon(file.key)}</div>

            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 truncate">
                {getFileName(file.key)}
              </h3>
              <div className="flex gap-4 text-sm text-gray-500">
                <span>{formatBytes(file.size)}</span>
                <span>{formatDate(file.lastModified)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleDownload(file)}
                className="p-2 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                title="Download"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleDelete(file)}
                className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="p-4 border-t">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
          >
            Load More
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && files.length > 0 && (
        <div className="p-4 border-t text-center text-gray-500">Loading...</div>
      )}
    </div>
  );
};
