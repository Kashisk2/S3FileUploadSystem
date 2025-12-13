# S3 File Upload System

A complete **Node.js + React** file upload system that supports large files (1GB+) using **AWS S3 Multipart Upload**.

## Features

- ✅ **Multipart Upload** - Handles files larger than 5GB
- ✅ **Chunked Upload** - Files split into 100MB chunks (configurable)
- ✅ **Parallel Upload** - Upload multiple chunks simultaneously
- ✅ **Progress Tracking** - Real-time upload progress with speed & ETA
- ✅ **Pause/Resume** - Control your uploads
- ✅ **Abort Upload** - Cancel ongoing uploads
- ✅ **Presigned URLs** - Secure direct-to-S3 uploads
- ✅ **File Management** - List, download, delete files
- ✅ **Asset Management** - Database-backed file asset tracking (like kaizo)
- ✅ **Entity Linking** - Link files to workspaces, projects, users
- ✅ **Soft Delete** - Archive and restore files
- ✅ **Beautiful UI** - Modern React UI with Tailwind CSS

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│   Node.js   │────▶│    AWS S3   │
│   Client    │     │   Server    │     │   Bucket    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │  1. Initiate     │
       │─────────────────▶│
       │                   │
       │  2. Get presigned │
       │     URLs         │
       │◀─────────────────│
       │                   │
       │  3. Upload chunks directly to S3
       │─────────────────────────────────────────────▶│
       │                   │
       │  4. Complete     │
       │─────────────────▶│
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- AWS S3 bucket (or MinIO for local development)

### Installation

```bash
cd S3FileUploadSystem

# Install dependencies
npm install

# Or with pnpm
pnpm install
```

### Configuration

Create a `.env` file in `packages/server/`:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name

# Optional: For MinIO or custom S3-compatible storage
# AWS_S3_ENDPOINT_URL=http://localhost:9000

# Database Configuration (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/s3_uploads

# Server Configuration
PORT=4000
CORS_ORIGIN=http://localhost:3000

# Upload Configuration
MAX_FILE_SIZE=5368709120  # 5GB in bytes
CHUNK_SIZE=104857600       # 100MB in bytes (minimum 5MB for S3)
```

### Database Setup (Optional but recommended)

The system uses PostgreSQL with Prisma for asset management:

```bash
cd packages/server

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Or run migrations
npm run db:migrate

# Open Prisma Studio to view data
npm run db:studio
```

### S3 Bucket CORS Configuration

Add this CORS configuration to your S3 bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Running the Application

```bash
# Run both server and client
npm run dev

# Or run separately
npm run dev:server  # Server on http://localhost:4000
npm run dev:client  # Client on http://localhost:3000
```

## API Endpoints

### Upload Endpoints

| Method | Endpoint                       | Description                           |
| ------ | ------------------------------ | ------------------------------------- |
| POST   | `/api/upload/initiate`         | Start a multipart upload              |
| POST   | `/api/upload/presigned-url`    | Get presigned URL for a single part   |
| POST   | `/api/upload/presigned-urls`   | Get presigned URLs for multiple parts |
| POST   | `/api/upload/complete`         | Complete the multipart upload         |
| POST   | `/api/upload/abort`            | Abort a multipart upload              |
| GET    | `/api/upload/status/:uploadId` | Get upload status                     |
| GET    | `/api/upload/resume/:uploadId` | Get resume info                       |

### File Endpoints

| Method | Endpoint                       | Description                |
| ------ | ------------------------------ | -------------------------- |
| GET    | `/api/files`                   | List all files             |
| POST   | `/api/files/download-url`      | Get presigned download URL |
| GET    | `/api/files/:fileKey/metadata` | Get file metadata          |
| DELETE | `/api/files/:fileKey`          | Delete a file              |

### Asset Management Endpoints (Database-backed)

| Method | Endpoint                    | Description                   |
| ------ | --------------------------- | ----------------------------- |
| GET    | `/api/assets`               | List assets with filters      |
| GET    | `/api/assets/stats`         | Get storage statistics        |
| GET    | `/api/assets/:id`           | Get asset by ID               |
| GET    | `/api/assets/:id/download`  | Get download URL for asset    |
| PATCH  | `/api/assets/:id`           | Update asset metadata         |
| DELETE | `/api/assets/:id`           | Soft delete asset             |
| DELETE | `/api/assets/:id?hard=true` | Hard delete (removes from S3) |
| POST   | `/api/assets/:id/restore`   | Restore soft-deleted asset    |
| POST   | `/api/assets/:id/duplicate` | Duplicate an asset            |
| POST   | `/api/assets/bulk-delete`   | Bulk delete assets            |

### Asset Query Parameters

```
GET /api/assets?entityType=ATTACHMENT&workspaceId=xxx&projectId=xxx&page=1&limit=50&search=filename
```

| Parameter   | Description                                    |
| ----------- | ---------------------------------------------- |
| entityType  | Filter by type (GENERAL, ATTACHMENT, IMAGE...) |
| entityId    | Filter by linked entity ID                     |
| workspaceId | Filter by workspace                            |
| projectId   | Filter by project                              |
| userId      | Filter by uploader                             |
| isDeleted   | Include deleted assets (default: false)        |
| isArchived  | Filter archived assets                         |
| page        | Page number (default: 1)                       |
| limit       | Items per page (default: 50)                   |
| search      | Search by filename                             |

## Project Structure

```
S3FileUploadSystem/
├── package.json              # Root package.json
├── packages/
│   ├── server/               # Node.js backend
│   │   ├── src/
│   │   │   ├── config/       # Configuration
│   │   │   ├── routes/       # API routes
│   │   │   ├── services/     # S3 service
│   │   │   ├── stores/       # Upload state management
│   │   │   ├── types/        # TypeScript types
│   │   │   └── index.ts      # Entry point
│   │   └── package.json
│   └── client/               # React frontend
│       ├── src/
│       │   ├── components/   # React components
│       │   ├── hooks/        # Custom hooks
│       │   ├── services/     # API services
│       │   ├── types/        # TypeScript types
│       │   ├── utils/        # Utility functions
│       │   └── App.tsx       # Main app
│       └── package.json
└── README.md
```

## How Multipart Upload Works

1. **Initiate**: Client requests to start an upload. Server creates a multipart upload session in S3.

2. **Get Presigned URLs**: Server generates presigned URLs for each chunk. Client uploads directly to S3.

3. **Upload Chunks**: Client splits the file and uploads each chunk to S3 using presigned URLs.

4. **Complete**: After all chunks are uploaded, client tells server to complete the upload. Server instructs S3 to combine chunks.

## Configuration Options

| Variable        | Default        | Description                         |
| --------------- | -------------- | ----------------------------------- |
| `MAX_FILE_SIZE` | 5GB            | Maximum file size allowed           |
| `CHUNK_SIZE`    | 100MB          | Size of each chunk (min 5MB for S3) |
| `CORS_ORIGIN`   | localhost:3000 | Allowed CORS origins                |

## Using with MinIO (Local Development)

MinIO is an S3-compatible object storage that you can run locally:

```bash
# Run MinIO with Docker
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Update `.env`:

```env
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_S3_BUCKET_NAME=uploads
AWS_S3_ENDPOINT_URL=http://localhost:9000
```

## Troubleshooting

### CORS Errors

Make sure your S3 bucket has the correct CORS configuration with `ExposeHeaders: ["ETag"]`.

### ETag Missing

S3 must expose the ETag header for multipart uploads to work. Check CORS configuration.

### Upload Timeout

For very large files, you may need to increase chunk size or add retry logic.

## License

MIT
