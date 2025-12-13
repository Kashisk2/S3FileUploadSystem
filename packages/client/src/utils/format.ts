/**
 * Format bytes to human readable string
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Format seconds to human readable time
 */
export const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return "--:--";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

/**
 * Format speed to human readable string
 */
export const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatBytes(bytesPerSecond)}/s`;
};

/**
 * Format date to locale string
 */
export const formatDate = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Get file extension from filename
 */
export const getFileExtension = (filename: string): string => {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
};

/**
 * Get file icon based on extension
 */
export const getFileIcon = (filename: string): string => {
  const ext = getFileExtension(filename);

  const iconMap: Record<string, string> = {
    // Images
    jpg: "🖼️",
    jpeg: "🖼️",
    png: "🖼️",
    gif: "🖼️",
    webp: "🖼️",
    svg: "🖼️",
    // Videos
    mp4: "🎬",
    mov: "🎬",
    avi: "🎬",
    mkv: "🎬",
    webm: "🎬",
    // Audio
    mp3: "🎵",
    wav: "🎵",
    ogg: "🎵",
    flac: "🎵",
    // Documents
    pdf: "📄",
    doc: "📝",
    docx: "📝",
    xls: "📊",
    xlsx: "📊",
    ppt: "📊",
    pptx: "📊",
    // Code
    js: "💻",
    ts: "💻",
    jsx: "💻",
    tsx: "💻",
    html: "💻",
    css: "💻",
    json: "💻",
    // Archives
    zip: "📦",
    rar: "📦",
    tar: "📦",
    gz: "📦",
    "7z": "📦",
    // Text
    txt: "📄",
    md: "📄",
    csv: "📄",
  };

  return iconMap[ext] || "📁";
};
