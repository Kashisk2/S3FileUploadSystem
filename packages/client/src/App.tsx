import React, { useState, useCallback, useRef } from "react";
import { Cloud, HardDrive } from "lucide-react";
import { FileDropzone } from "./components/FileDropzone";
import { UploadProgress } from "./components/UploadProgress";
import { FileList } from "./components/FileList";
import { useUpload } from "./hooks/useUpload";
import type { UploadProgress as UploadProgressType } from "./types";

const App: React.FC = () => {
  const { uploadFile, pause, resume, abort, progress, isUploading, isPaused } =
    useUpload();
  const [completedUploads, setCompletedUploads] = useState<
    UploadProgressType[]
  >([]);
  const fileListRef = useRef<{ refresh: () => void } | null>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      try {
        const result = await uploadFile(file);
        console.log("Upload completed:", result);

        // Add to completed uploads
        if (progress) {
          setCompletedUploads((prev) => [
            ...prev,
            { ...progress, status: "completed", progress: 100 },
          ]);
        }
      } catch (error) {
        console.error("Upload failed:", error);
        // Add to completed uploads with failed status
        if (progress) {
          setCompletedUploads((prev) => [
            ...prev,
            { ...progress, status: "failed" },
          ]);
        }
      }
    },
    [uploadFile, progress]
  );

  const handleRefresh = useCallback(() => {
    // Clear completed uploads when file list refreshes
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                S3 File Upload System
              </h1>
              <p className="text-sm text-gray-500">
                Upload large files (1GB+) with multipart upload
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Upload */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-600" />
                Upload File
              </h2>

              <FileDropzone
                onFileSelect={handleFileSelect}
                maxSize={5 * 1024 * 1024 * 1024} // 5GB
                disabled={isUploading}
              />

              {/* Features List */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Multipart Upload
                    </p>
                    <p className="text-xs text-gray-500">
                      Files split into chunks
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Parallel Upload
                    </p>
                    <p className="text-xs text-gray-500">3 concurrent chunks</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 mt-2 rounded-full bg-purple-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Pause & Resume
                    </p>
                    <p className="text-xs text-gray-500">
                      Control your uploads
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 mt-2 rounded-full bg-orange-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Progress Tracking
                    </p>
                    <p className="text-xs text-gray-500">Real-time updates</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Current Upload Progress */}
            {progress && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Current Upload
                </h3>
                <UploadProgress
                  progress={progress}
                  onPause={pause}
                  onResume={resume}
                  onAbort={abort}
                />
              </div>
            )}

            {/* Completed Uploads */}
            {completedUploads.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700">
                    Recent Uploads
                  </h3>
                  <button
                    onClick={() => setCompletedUploads([])}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-2">
                  {completedUploads
                    .slice(-5)
                    .reverse()
                    .map((upload, index) => (
                      <UploadProgress
                        key={`${upload.uploadId}-${index}`}
                        progress={upload}
                      />
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - File List */}
          <div>
            <FileList onRefresh={handleRefresh} />
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                1
              </div>
              <h3 className="font-medium text-gray-900 mb-1">
                Initiate Upload
              </h3>
              <p className="text-sm text-gray-500">
                Server creates a multipart upload session
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                2
              </div>
              <h3 className="font-medium text-gray-900 mb-1">Split File</h3>
              <p className="text-sm text-gray-500">
                File is split into 100MB chunks
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                3
              </div>
              <h3 className="font-medium text-gray-900 mb-1">Upload Chunks</h3>
              <p className="text-sm text-gray-500">
                Chunks uploaded in parallel to S3
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                4
              </div>
              <h3 className="font-medium text-gray-900 mb-1">Complete</h3>
              <p className="text-sm text-gray-500">
                S3 combines chunks into final file
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 py-6 text-center text-sm text-gray-500">
        <p>S3 Multipart Upload System - Supports files up to 5GB</p>
      </footer>
    </div>
  );
};

export default App;
