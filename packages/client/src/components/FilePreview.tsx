import React, { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import "@cyntler/react-doc-viewer/dist/index.css";
import { apiService } from "../services/api.service";
import type { Asset } from "../types";

interface FilePreviewProps {
  asset: Asset | null;
  onClose: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ asset, onClose }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asset) {
      setPreviewUrl(null);
      return;
    }

    const loadPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get preview URL (inline disposition for viewing)
        const response = await apiService.getAssetDownloadUrl(
          asset.id,
          "inline" // Use inline for preview instead of attachment
        );
        setPreviewUrl(response.downloadUrl || "");
      } catch (err: any) {
        setError(err.message || "Failed to load preview");
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [asset]);

  if (!asset) return null;

  // Prepare document for react-doc-viewer
  const documents = previewUrl
    ? [
        {
          uri: previewUrl,
          fileName: asset.name,
          fileType: asset.mimeType || undefined,
        },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-lg shadow-2xl max-w-7xl max-h-[90vh] w-full mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {asset.name}
            </h3>
            <p className="text-sm text-gray-500">
              {asset.mimeType || "Unknown type"}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden bg-gray-50">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && previewUrl && documents.length > 0 && (
            <div className="h-full w-full" style={{ position: "relative" }}>
              <style>{`
                /* Hide any download buttons in react-doc-viewer */
                #react-doc-viewer button[title*="Download"],
                #react-doc-viewer button[title*="download"],
                #react-doc-viewer a[title*="Download"],
                #react-doc-viewer a[title*="download"],
                #react-doc-viewer [class*="download"],
                #react-doc-viewer [id*="download"],
                /* Hide download buttons in PDF viewer */
                #react-doc-viewer embed[type="application/pdf"] + * [href*="download"],
                /* Hide any download-related UI elements */
                #react-doc-viewer .download-button,
                #react-doc-viewer .btn-download {
                  display: none !important;
                }
              `}</style>
              <DocViewer
                documents={documents}
                pluginRenderers={DocViewerRenderers}
                config={{
                  header: {
                    disableHeader: true, // We have our own custom header
                    disableFileName: false,
                    retainURLParams: false,
                  },
                  csvDelimiter: ",",
                  pdfZoom: {
                    defaultZoom: 1.0,
                    zoomJump: 0.1,
                  },
                  pdfVerticalScrollByDefault: true,
                }}
                style={{ height: "100%", width: "100%" }}
                theme={{
                  primary: "#3b82f6",
                  secondary: "#ffffff",
                  tertiary: "#3b82f699",
                  textPrimary: "#1f2937",
                  textSecondary: "#6b7280",
                  textTertiary: "#9ca3af",
                  disableThemeScrollbar: false,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
