import React from "react";
import {
  Pause,
  Play,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { UploadProgress as UploadProgressType } from "../types";
import {
  formatBytes,
  formatTime,
  formatSpeed,
  getFileIcon,
} from "../utils/format";

interface UploadProgressProps {
  progress: UploadProgressType;
  onPause?: () => void;
  onResume?: () => void;
  onAbort?: () => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  progress,
  onPause,
  onResume,
  onAbort,
}) => {
  const {
    fileName,
    fileSize,
    status,
    progress: percent,
    uploadedBytes,
    completedChunks,
    totalChunks,
    speed,
    remainingTime,
    error,
  } = progress;

  const getStatusColor = () => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "failed":
      case "aborted":
        return "bg-red-500";
      case "paused":
        return "bg-yellow-500";
      default:
        return "bg-blue-500";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
      case "aborted":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "paused":
        return <Pause className="w-5 h-5 text-yellow-500" />;
      case "uploading":
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Loader2 className="w-5 h-5 text-gray-400" />;
    }
  };

  const canControl = status === "uploading" || status === "paused";

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      <div className="flex items-start gap-4">
        {/* File Icon */}
        <div className="text-3xl">{getFileIcon(fileName)}</div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900 truncate">{fileName}</h3>
            {getStatusIcon()}
          </div>

          {/* Progress Bar */}
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
            <div
              className={`absolute left-0 top-0 h-full transition-all duration-300 ${getStatusColor()}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            <span>
              {formatBytes(uploadedBytes)} / {formatBytes(fileSize)}
            </span>
            <span>{percent.toFixed(1)}%</span>
            {status === "uploading" && (
              <>
                <span>{formatSpeed(speed)}</span>
                <span>{formatTime(remainingTime)} remaining</span>
              </>
            )}
            <span>
              {completedChunks} / {totalChunks} chunks
            </span>
          </div>

          {/* Error Message */}
          {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}

          {/* Status Message */}
          {status === "completed" && (
            <p className="mt-2 text-sm text-green-600">Upload complete!</p>
          )}
          {status === "aborted" && (
            <p className="mt-2 text-sm text-gray-600">Upload cancelled</p>
          )}
        </div>

        {/* Control Buttons */}
        {canControl && (
          <div className="flex gap-2">
            {status === "uploading" ? (
              <button
                onClick={onPause}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                title="Pause"
              >
                <Pause className="w-5 h-5 text-gray-600" />
              </button>
            ) : (
              <button
                onClick={onResume}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                title="Resume"
              >
                <Play className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <button
              onClick={onAbort}
              className="p-2 rounded-full hover:bg-red-100 transition-colors"
              title="Cancel"
            >
              <X className="w-5 h-5 text-red-600" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
