# S3 File Upload System - Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Components](#architecture-components)
3. [Multipart Upload Flow](#multipart-upload-flow)
4. [Resume Functionality](#resume-functionality)
5. [Pause/Resume/Abort Operations](#pauseresumeabort-operations)
6. [Database Integration](#database-integration)
7. [Client-Side Storage](#client-side-storage)
8. [API Endpoints](#api-endpoints)
9. [Error Handling](#error-handling)
10. [Configuration](#configuration)

---

## System Overview

The S3 File Upload System is a robust, production-ready file upload solution that supports:

- **Large file uploads** via AWS S3 multipart upload
- **Automatic resume** after page refresh or browser closure
- **Pause/Resume/Abort** controls
- **Real-time progress tracking**
- **Database-backed** upload session management
- **S3-compatible storage** (works with MinIO for local development)

### Key Technologies

- **Frontend**: React + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Storage**: AWS S3 (or MinIO)
- **Client Storage**: IndexedDB (for file persistence)

---

## Architecture Components

### Client-Side Components

#### 1. **UploadService** (`packages/client/src/services/upload.service.ts`)

The core upload service that handles:

- Initiating multipart uploads
- Uploading chunks with concurrency control
- Tracking upload progress
- Managing pause/resume/abort states
- Saving progress to database

**Key Methods:**

- `upload()` - Start a new upload
- `resumeFromDatabase()` - Resume an incomplete upload
- `pause()` - Pause the upload
- `resume()` - Resume a paused upload
- `abort()` - Cancel the upload

#### 2. **useUpload Hook** (`packages/client/src/hooks/useUpload.ts`)

React hook that provides:

- Upload state management
- Auto-resume incomplete uploads on mount
- Progress tracking
- Error handling

#### 3. **FileStorageService** (`packages/client/src/services/fileStorage.service.ts`)

Manages IndexedDB storage for:

- Storing File objects for automatic resume
- Retrieving files by uploadId
- Cleaning up completed/aborted uploads

#### 4. **APIService** (`packages/client/src/services/api.service.ts`)

Handles all API communication:

- Upload initiation
- Getting presigned URLs
- Uploading chunks
- Completing uploads
- Resuming uploads
- Aborting uploads

### Server-Side Components

#### 1. **S3Service** (`packages/server/src/services/s3.service.ts`)

Handles all S3 operations:

- Creating multipart uploads
- Generating presigned URLs
- Listing uploaded parts
- Completing multipart uploads
- Aborting uploads

#### 2. **UploadSessionService** (`packages/server/src/services/upload-session.service.ts`)

Manages upload sessions in the database:

- Creating sessions
- Tracking completed parts
- Updating session status
- Retrieving session data for resume

#### 3. **AssetService** (`packages/server/src/services/asset.service.ts`)

Manages file assets after upload completion:

- Creating asset records
- Linking assets to entities
- Soft delete support

---

## Multipart Upload Flow

### Step-by-Step Process

#### 1. **Upload Initiation**

```
User selects file
  ↓
Client: uploadFile() called
  ↓
Client: UploadService.upload() initiated
  ↓
Client: POST /api/upload/initiate
  ↓
Server: S3Service.initiateMultipartUpload()
  ↓
Server: Creates UploadSession in database
  ↓
Server: Returns { uploadId, fileKey, totalChunks, chunkSize }
  ↓
Client: Stores file in IndexedDB
  ↓
Client: Starts uploading chunks
```

#### 2. **Chunk Upload Process**

```
For each chunk (with concurrency limit):
  ↓
Client: GET presigned URL for chunk
  ↓
Client: Upload chunk directly to S3 using presigned URL
  ↓
Client: Receive ETag from S3
  ↓
Client: POST /api/upload/complete-part (save to database)
  ↓
Server: Updates UploadSession.completedParts
  ↓
Client: Updates progress and continues
```

#### 3. **Upload Completion**

```
All chunks uploaded
  ↓
Client: POST /api/upload/complete with all parts
  ↓
Server: S3Service.completeMultipartUpload()
  ↓
Server: Verifies parts exist in S3
  ↓
Server: Completes multipart upload on S3
  ↓
Server: Creates Asset record
  ↓
Server: Updates session status to COMPLETED
  ↓
Client: Removes file from IndexedDB
  ↓
Client: Returns file URL
```

---

## Resume Functionality

### How Auto-Resume Works

#### On Page Load:

```
1. useEffect hook runs on mount
2. Fetches incomplete uploads from database
3. For each incomplete upload:
   - Checks if file exists in IndexedDB
   - Fetches actual uploaded parts from S3
   - Calculates remaining parts
   - Automatically resumes upload in background
```

#### Resume Process:

```
Client: resumeFromDatabase(uploadId)
  ↓
Client: GET /api/upload/resume/:uploadId
  ↓
Server: Fetches session from database
  ↓
Server: Lists actual uploaded parts from S3 (source of truth)
  ↓
Server: Calculates remaining parts
  ↓
Server: Returns { upload, uploadedParts, remainingParts }
  ↓
Client: Retrieves file from IndexedDB
  ↓
Client: Restores upload state
  ↓
Client: Uploads only remaining parts
  ↓
Client: Completes upload when done
```

### Why S3 is Source of Truth

The system uses **S3 as the source of truth** for uploaded parts because:

- Database might be out of sync
- Parts might be uploaded but not saved to database
- S3 always has the accurate state

The resume endpoint:

1. Fetches actual parts from S3 using `listUploadedParts()`
2. Merges with database parts (prefers S3 parts)
3. Returns accurate remaining parts list

---

## Pause/Resume/Abort Operations

### Pause Implementation

```typescript
pause(): void {
  this.state.isPaused = true;
  // Upload loop checks isPaused before starting new chunks
  // Current chunks continue to completion
}
```

**How it works:**

- Sets `isPaused = true` in state
- Upload loop checks pause state before starting new chunks
- Currently uploading chunks continue to finish
- New chunks are not started until resumed

### Resume Implementation

```typescript
resume(): void {
  this.state.isPaused = false;
  // Upload loop continues from where it paused
}
```

**How it works:**

- Sets `isPaused = false` in state
- Upload loop detects pause is cleared
- Continues uploading remaining chunks
- Progress tracking resumes

### Abort Implementation

```typescript
abort(): Promise<void> {
  this.state.isAborted = true;
  this.abortController.abort(); // Cancels all axios requests
  await apiService.abortUpload(uploadId, fileKey); // Aborts on S3
  // Cleans up IndexedDB
}
```

**How it works:**

1. Sets `isAborted = true` in state
2. Aborts all in-progress axios requests using `AbortController`
3. Calls S3 API to abort multipart upload
4. Removes file from IndexedDB
5. Upload loop detects abort and stops

---

## Database Integration

### UploadSession Model

```prisma
model UploadSession {
  id              String       @id
  uploadId        String       @unique  // S3 upload ID
  fileKey         String
  fileName        String
  fileSize        BigInt
  fileType        String
  chunkSize       Int
  totalChunks     Int
  completedParts  Json         // Array of {partNumber, etag}
  status          UploadStatus // PENDING, UPLOADING, COMPLETED, FAILED, ABORTED
  expiresAt       DateTime?
  createdAt       DateTime
  updatedAt       DateTime
}
```

### How Progress is Saved

1. **After each chunk completes:**

   - Client calls `POST /api/upload/complete-part`
   - Server updates `UploadSession.completedParts` array
   - Server updates status to `UPLOADING`

2. **On upload completion:**

   - Server updates status to `COMPLETED`
   - Creates Asset record

3. **On abort:**
   - Server updates status to `ABORTED`
   - S3 multipart upload is aborted

### Why Database Instead of localStorage

- **Persistence**: Survives browser cache clearing
- **Multi-device**: Can resume on different devices
- **Reliability**: Server-side validation
- **Scalability**: Can handle multiple concurrent uploads
- **Audit trail**: Track upload history

---

## Client-Side Storage

### IndexedDB Usage

**Purpose**: Store the actual `File` object for automatic resume

**Why IndexedDB?**

- Can store large File objects (localStorage has size limits)
- Persists across page refreshes
- Asynchronous API (doesn't block UI)

**Storage Structure:**

```typescript
{
  uploadId: string,
  file: File,
  fileName: string,
  fileSize: number,
  fileType: string,
  lastModified: number
}
```

**Lifecycle:**

1. **On upload start**: File stored in IndexedDB
2. **During upload**: File remains in IndexedDB
3. **On completion**: File removed from IndexedDB
4. **On abort**: File removed from IndexedDB
5. **On resume**: File retrieved from IndexedDB

---

## API Endpoints

### Upload Endpoints

#### `POST /api/upload/initiate`

Initiates a new multipart upload.

**Request:**

```json
{
  "fileName": "video.mp4",
  "fileSize": 160000000,
  "fileType": "video/mp4"
}
```

**Response:**

```json
{
  "uploadId": "BT0zOIiJUs4G...",
  "fileKey": "uploads/2025/12/uuid-filename.mp4",
  "totalChunks": 16,
  "chunkSize": 10485760
}
```

#### `POST /api/upload/presigned-urls`

Gets presigned URLs for uploading chunks.

**Request:**

```json
{
  "uploadId": "BT0zOIiJUs4G...",
  "fileKey": "uploads/2025/12/uuid-filename.mp4",
  "partNumbers": [1, 2, 3]
}
```

**Response:**

```json
{
  "presignedUrls": [
    { "partNumber": 1, "url": "https://..." },
    { "partNumber": 2, "url": "https://..." }
  ]
}
```

#### `POST /api/upload/complete-part`

Marks a part as completed in the database.

**Request:**

```json
{
  "uploadId": "BT0zOIiJUs4G...",
  "partNumber": 1,
  "etag": "3ee7af1cb2fa734073bb996ab2497b40"
}
```

#### `POST /api/upload/complete`

Completes the multipart upload.

**Request:**

```json
{
  "uploadId": "BT0zOIiJUs4G...",
  "fileKey": "uploads/2025/12/uuid-filename.mp4",
  "parts": [
    { "partNumber": 1, "etag": "..." },
    { "partNumber": 2, "etag": "..." }
  ]
}
```

**Response:**

```json
{
  "fileUrl": "https://bucket.s3.region.amazonaws.com/...",
  "fileKey": "uploads/2025/12/uuid-filename.mp4",
  "etag": "...",
  "asset": { ... }
}
```

#### `GET /api/upload/resume/:uploadId`

Gets upload state for resuming.

**Response:**

```json
{
  "upload": {
    "uploadId": "...",
    "fileKey": "...",
    "fileName": "...",
    "fileSize": 160000000,
    "totalChunks": 16,
    "chunkSize": 10485760,
    "completedParts": [...]
  },
  "uploadedParts": [...],
  "remainingParts": [3, 4, 5, ...],
  "progress": 12.5
}
```

#### `POST /api/upload/abort`

Aborts the multipart upload.

**Request:**

```json
{
  "uploadId": "BT0zOIiJUs4G...",
  "fileKey": "uploads/2025/12/uuid-filename.mp4"
}
```

#### `GET /api/upload/incomplete`

Gets all incomplete uploads.

**Response:**

```json
{
  "uploads": [
    {
      "uploadId": "...",
      "fileName": "...",
      "fileSize": 160000000,
      "progress": 12.5,
      "uploadedBytes": 20000000,
      "status": "UPLOADING"
    }
  ]
}
```

---

## Error Handling

### Client-Side Error Handling

#### Upload Errors

- **Network errors**: Retried automatically by axios
- **S3 errors**: Handled with specific error messages
- **NoSuchUpload**: Upload expired or already completed
- **Part errors**: Specific part number in error message

#### Resume Errors

- **File not found**: Prompts user to re-select file
- **Upload expired**: Removes from incomplete list
- **Session not found**: Clears state and shows error

### Server-Side Error Handling

#### Completion Errors

- **NoSuchUpload**: Checks if file already exists (already completed)
- **Missing parts**: Validates all parts exist in S3
- **Invalid parts**: Uses S3 parts as source of truth

#### Robust Completion Logic

```typescript
1. List actual parts from S3
2. If NoSuchUpload error:
   - Check if file exists (already completed)
   - If exists, return success
   - If not, try completing with client parts
3. Verify all client parts exist in S3
4. Use S3 parts as source of truth
5. Complete with all valid parts
```

---

## Configuration

### Environment Variables

#### Server (.env)

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_S3_ENDPOINT_URL=http://localhost:9000  # For MinIO

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/s3upload

# Server
PORT=4000

# Upload Settings
MAX_FILE_SIZE=5368709120  # 5GB
CHUNK_SIZE=10485760        # 10MB
```

#### Client

- API base URL: `/api` (proxied to server)
- Concurrency: 3 chunks in parallel (configurable)
- Auto-resume: Enabled by default

### Chunk Size Calculation

Default chunk size: **10MB (10,485,760 bytes)**

For a 160MB file:

- Total chunks: 160MB / 10MB = 16 chunks
- Each chunk uploaded sequentially (or in parallel with concurrency limit)

---

## Data Flow Diagrams

### New Upload Flow

```
User → Select File
  ↓
useUpload.uploadFile()
  ↓
UploadService.upload()
  ↓
POST /api/upload/initiate
  ↓
S3: CreateMultipartUpload
  ↓
DB: Create UploadSession
  ↓
IndexedDB: Store File
  ↓
For each chunk:
  GET presigned URL
  PUT chunk to S3
  POST complete-part
  ↓
POST /api/upload/complete
  ↓
S3: CompleteMultipartUpload
  ↓
DB: Create Asset
  ↓
IndexedDB: Remove File
  ↓
Return file URL
```

### Resume Flow

```
Page Load
  ↓
GET /api/upload/incomplete
  ↓
For each incomplete:
  GET /api/upload/resume/:uploadId
  ↓
S3: ListParts (get actual parts)
  ↓
Calculate remaining parts
  ↓
IndexedDB: Get File
  ↓
Upload remaining parts
  ↓
Complete upload
```

---

## Best Practices

### 1. **Always Use S3 as Source of Truth**

- When resuming, fetch actual parts from S3
- Don't rely solely on database state
- Merge S3 and database parts for accuracy

### 2. **Handle Edge Cases**

- Upload already completed (file exists)
- Upload expired (NoSuchUpload)
- Parts missing in S3
- Network interruptions

### 3. **Progress Tracking**

- Track both completed parts and in-progress chunks
- Calculate bytes from actual chunk sizes
- Handle last chunk being smaller

### 4. **Error Recovery**

- Auto-resume on page refresh
- Clear expired uploads from UI
- Provide clear error messages
- Allow manual resume if auto-resume fails

### 5. **Performance**

- Use concurrency for parallel uploads
- Save progress asynchronously (don't await)
- Clean up IndexedDB after completion
- Limit concurrent uploads per user

---

## Troubleshooting

### Upload Stuck at 100%

- Check if completion API is being called
- Verify all parts exist in S3
- Check server logs for completion errors

### Resume Not Working

- Verify file exists in IndexedDB
- Check upload session exists in database
- Verify S3 parts are accessible
- Check browser console for errors

### Duplicate Uploads

- Check activeResumesRef is tracking resumes
- Verify auto-resume isn't running multiple times
- Check for duplicate upload service instances

### Pause/Resume Not Working

- Verify isPaused state is being checked
- Check upload loop is respecting pause state
- Ensure abort controller is properly initialized

---

## Future Enhancements

1. **Retry Logic**: Automatic retry for failed chunks
2. **Bandwidth Throttling**: Limit upload speed
3. **Chunk Verification**: Verify chunks after upload
4. **Upload Queue**: Manage multiple uploads
5. **Progress Persistence**: Save progress more frequently
6. **Compression**: Client-side compression before upload
7. **Encryption**: End-to-end encryption support

---

## Security Considerations

1. **Presigned URLs**: Time-limited, single-use URLs
2. **CORS Configuration**: Properly configured for S3
3. **File Validation**: Server-side file type/size validation
4. **Rate Limiting**: Prevent abuse
5. **Authentication**: Add user authentication for production
6. **Encryption**: Use HTTPS for all API calls

---

## Performance Metrics

- **Chunk Size**: 10MB (optimal for most networks)
- **Concurrency**: 3 chunks (configurable)
- **Progress Updates**: Real-time via axios onUploadProgress
- **Database Writes**: Async, non-blocking
- **IndexedDB**: Stores files efficiently

---

This documentation provides a comprehensive overview of how the S3 File Upload System works. For setup instructions, see the main README.md file.
