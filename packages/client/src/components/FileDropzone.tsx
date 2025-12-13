import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileUp } from "lucide-react";
import { formatBytes } from "../utils/format";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  maxSize?: number; // bytes
  disabled?: boolean;
  accept?: Record<string, string[]>;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFileSelect,
  maxSize = 5 * 1024 * 1024 * 1024, // 5GB default
  disabled = false,
  accept,
}) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    fileRejections,
  } = useDropzone({
    onDrop,
    maxSize,
    multiple: false,
    disabled,
    accept,
  });

  const hasError = fileRejections.length > 0;
  const errorMessage =
    fileRejections[0]?.errors[0]?.message ||
    `File too large. Maximum size is ${formatBytes(maxSize)}`;

  return (
    <div
      {...getRootProps()}
      className={`
        relative border-2 border-dashed rounded-xl p-8 transition-all duration-200
        ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
        ${isDragActive && !isDragReject ? "border-blue-500 bg-blue-50" : ""}
        ${isDragReject || hasError ? "border-red-500 bg-red-50" : ""}
        ${
          !isDragActive && !hasError
            ? "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
            : ""
        }
      `}
    >
      <input {...getInputProps()} />

      <div className="flex flex-col items-center justify-center text-center">
        <div
          className={`
            p-4 rounded-full mb-4 transition-colors
            ${isDragActive && !isDragReject ? "bg-blue-100" : ""}
            ${isDragReject || hasError ? "bg-red-100" : ""}
            ${!isDragActive && !hasError ? "bg-gray-100" : ""}
          `}
        >
          {isDragActive ? (
            <FileUp
              className={`w-12 h-12 ${
                isDragReject ? "text-red-500" : "text-blue-500"
              }`}
            />
          ) : (
            <Upload className="w-12 h-12 text-gray-400" />
          )}
        </div>

        {isDragActive ? (
          <p
            className={`text-lg font-medium ${
              isDragReject ? "text-red-600" : "text-blue-600"
            }`}
          >
            {isDragReject ? "File type not supported" : "Drop the file here"}
          </p>
        ) : hasError ? (
          <p className="text-lg font-medium text-red-600">{errorMessage}</p>
        ) : (
          <>
            <p className="text-lg font-medium text-gray-700 mb-2">
              Drag & drop a file here, or click to select
            </p>
            <p className="text-sm text-gray-500">
              Supports files up to {formatBytes(maxSize)}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
