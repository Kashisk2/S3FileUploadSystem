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

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** or **pnpm** (comes with Node.js)
- **Docker** and **Docker Compose** ([Download](https://www.docker.com/get-started)) - for running PostgreSQL database
- **AWS S3 bucket** (or MinIO for local development)
  - AWS Account with S3 access
  - S3 bucket created
  - IAM user with S3 permissions

## Step-by-Step Setup Guide

### Step 1: Clone and Install Dependencies

```bash
# Navigate to the project directory
cd S3FileUploadSystem

# Install all dependencies (root + packages)
npm install

# Or with pnpm
pnpm install
```

### Step 2: Set Up Database (PostgreSQL)

The project uses PostgreSQL with Docker Compose for easy local development.

#### 2.1 Start PostgreSQL Database

```bash
# Start the database container
docker-compose up -d postgres

# Verify it's running
docker ps | grep s3-upload-db
```

The database will be available at:

- **Host**: localhost
- **Port**: 5432
- **Database**: s3_uploads
- **Username**: s3upload
- **Password**: s3upload123 (⚠️ **Development default** - change for production!)
- **Connection String**: `postgresql://s3upload:s3upload123@localhost:5432/s3_uploads`

> **⚠️ Security Note**: The database credentials above are **development defaults** from `docker-compose.yml`. For production or shared environments, change these credentials in `docker-compose.yml` and update your `.env` file accordingly.

#### 2.2 Initialize Database Schema

```bash
# Navigate to server directory
cd packages/server

# Generate Prisma client
npm run db:generate

# Push schema to database (creates tables)
npm run db:push

# Optional: View database in Prisma Studio (GUI)
npm run db:studio
# Opens at http://localhost:5555
```

**Database Tables Created:**

- `file_assets` - Stores file metadata and asset information
- `upload_sessions` - Tracks multipart upload progress

### Step 3: Configure Server Environment Variables

Create a `.env` file in `packages/server/` directory:

```bash
cd packages/server
touch .env
```

Add the following configuration to `packages/server/.env`:

```env
# ============================================
# AWS S3 Configuration (REQUIRED)
# ============================================
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name

# Optional: For MinIO or custom S3-compatible storage
# Uncomment and configure if using MinIO
# AWS_S3_ENDPOINT_URL=http://localhost:9000

# ============================================
# Database Configuration (REQUIRED)
# ============================================
# ⚠️ Development default - change password for production!
DATABASE_URL=postgresql://s3upload:s3upload123@localhost:5432/s3_uploads

# ============================================
# Server Configuration (OPTIONAL)
# ============================================
PORT=4000
CORS_ORIGIN=http://localhost:3000

# ============================================
# Upload Configuration (OPTIONAL)
# ============================================
MAX_FILE_SIZE=5368709120   # 5GB in bytes (default)
CHUNK_SIZE=104857600        # 100MB in bytes (default, minimum 5MB for S3)
```

**⚠️ Security Important:**

- Replace the AWS credentials (`your_access_key_id`, `your_secret_access_key`) with your **actual** AWS credentials
- Replace `your-bucket-name` with your actual S3 bucket name
- The database password (`s3upload123`) is a development default - **change it for production**
- **Never commit** your `.env` file to version control - it should be in `.gitignore`

### Step 4: Configure S3 Bucket CORS

To allow direct uploads from the browser to S3, configure CORS on your S3 bucket:

1. Go to your S3 bucket in AWS Console
2. Navigate to **Permissions** → **CORS**
3. Add the following CORS configuration:

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

**Note:** For production, replace `http://localhost:3000` with your actual frontend URL.

### Step 5: Verify Setup

#### 5.1 Verify Database Connection

```bash
# Check if database container is running
docker ps | grep s3-upload-db

# View database logs
docker-compose logs postgres

# Test database connection (from server directory)
cd packages/server
npm run db:studio
# Should open Prisma Studio at http://localhost:5555
```

#### 5.2 Verify Server Configuration

```bash
# From root directory, test server startup
cd packages/server
npm run dev

# Should start without errors
# Press Ctrl+C to stop
```

### Step 6: Run the Application

#### Option A: Run Both Server and Client Together

```bash
# From root directory
npm run dev
```

This will start:

- **Server**: http://localhost:4000
- **Client**: http://localhost:3000

#### Option B: Run Separately

```bash
# Terminal 1: Start server
npm run dev:server
# Server runs on http://localhost:4000

# Terminal 2: Start client
npm run dev:client
# Client runs on http://localhost:3000
```

### Step 7: Access the Application

- **Frontend (Client)**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Prisma Studio** (Database GUI): http://localhost:5555 (run `cd packages/server && npm run db:studio`)

## Using MinIO for Local Development (Optional)

If you don't want to use AWS S3, you can use MinIO (S3-compatible storage) locally:

### Step 1: Start MinIO with Docker

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

MinIO Console: http://localhost:9001 (login with minioadmin/minioadmin)

> **⚠️ Note**: `minioadmin/minioadmin` are default MinIO credentials for local development only. Change them for any shared or production environment.

### Step 2: Create a Bucket

1. Open MinIO Console at http://localhost:9001
2. Create a bucket named `uploads` (or any name you prefer)

### Step 3: Update Server .env

```env
# ⚠️ These are MinIO default credentials - change for production!
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_S3_BUCKET_NAME=uploads
AWS_S3_ENDPOINT_URL=http://localhost:9000
AWS_REGION=us-east-1
```

### Step 4: Configure MinIO CORS

In MinIO Console:

1. Go to **Settings** → **CORS**
2. Add CORS rule:
   - Allowed Origins: `http://localhost:3000`
   - Allowed Methods: `GET, PUT, POST, DELETE, HEAD`
   - Allowed Headers: `*`
   - Expose Headers: `ETag`

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
├── docker-compose.yml        # PostgreSQL database setup
├── packages/
│   ├── server/               # Node.js backend
│   │   ├── src/
│   │   │   ├── config/       # Configuration
│   │   │   ├── routes/       # API routes
│   │   │   ├── services/     # S3 service
│   │   │   ├── stores/       # Upload state management
│   │   │   ├── types/        # TypeScript types
│   │   │   └── index.ts      # Entry point
│   │   ├── prisma/
│   │   │   └── schema.prisma # Database schema
│   │   ├── .env              # Server environment variables
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
| `PORT`          | 4000           | Server port                         |
| `CORS_ORIGIN`   | localhost:3000 | Allowed CORS origins                |

## Database Management Commands

```bash
# Start database
docker-compose up -d postgres

# Stop database
docker-compose down

# View database logs
docker-compose logs postgres

# View database in Prisma Studio (GUI)
cd packages/server && npm run db:studio

# Push schema changes
cd packages/server && npm run db:push

# Generate Prisma client
cd packages/server && npm run db:generate

# Run migrations (alternative to db:push)
cd packages/server && npm run db:migrate

# Access database via psql
docker exec -it s3-upload-db psql -U s3upload -d s3_uploads

# Reset database (⚠️ deletes all data)
docker-compose down -v
docker-compose up -d postgres
sleep 5
cd packages/server && npm run db:push
```

## Troubleshooting

### Database Issues

#### Database not starting?

```bash
# Check if container is running
docker ps | grep s3-upload-db

# View logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres

# Check if port 5432 is available
lsof -i :5432
```

#### Connection refused?

- Make sure Docker is running
- Check if port 5432 is available
- Verify the container is running: `docker ps`
- Check database logs: `docker-compose logs postgres`

#### Reset database

```bash
# Stop and remove container + data
docker-compose down -v

# Start fresh
docker-compose up -d postgres
sleep 5
cd packages/server && npm run db:push
```

### Server Issues

#### Missing environment variables error?

Make sure `packages/server/.env` exists and contains:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET_NAME`
- `DATABASE_URL`

#### Port already in use?

Change the `PORT` in `packages/server/.env` or stop the process using port 4000.

### S3/CORS Issues

#### CORS Errors

- Make sure your S3 bucket has the correct CORS configuration
- Ensure `ExposeHeaders: ["ETag"]` is included
- Verify `AllowedOrigins` includes your frontend URL (http://localhost:3000 for local dev)

#### ETag Missing

S3 must expose the ETag header for multipart uploads to work. Check CORS configuration includes:

```json
"ExposeHeaders": ["ETag"]
```

#### Upload Timeout

For very large files, you may need to:

- Increase chunk size in `.env`: `CHUNK_SIZE=209715200` (200MB)
- Add retry logic (future enhancement)

### Client Issues

#### Client not connecting to server?

- Verify server is running on port 4000
- Check `vite.config.ts` proxy configuration
- Check browser console for errors

#### Build errors?

```bash
# Clear node_modules and reinstall
rm -rf node_modules packages/*/node_modules
npm install
```

## Development Workflow

1. **Start Database**: `docker-compose up -d postgres`
2. **Start Server**: `npm run dev:server` (or `npm run dev` for both)
3. **Start Client**: `npm run dev:client` (or `npm run dev` for both)
4. **View Database**: `cd packages/server && npm run db:studio`

## Production Deployment

For production deployment:

1. Set up production PostgreSQL database
2. Update `DATABASE_URL` in server `.env`
3. Configure production S3 bucket with proper CORS
4. Update `CORS_ORIGIN` to production frontend URL
5. Build the application:
   ```bash
   npm run build
   ```
6. Start the server:
   ```bash
   npm run start
   ```

## Security Best Practices

### ⚠️ Important Security Notes

1. **Environment Variables**

   - **Never commit** `.env` files to version control (already in `.gitignore`)
   - Use strong, unique passwords for production databases
   - Rotate AWS credentials regularly
   - Use IAM roles with least privilege for S3 access

2. **Development vs Production**

   - The credentials shown in this README are **development defaults only**:
     - Database password: `s3upload123` (change in `docker-compose.yml` for production)
     - MinIO credentials: `minioadmin/minioadmin` (change for shared/production environments)
   - **Always change default credentials** before deploying to production

3. **AWS S3 Security**

   - Use IAM users with minimal required permissions
   - Enable S3 bucket versioning and logging
   - Configure bucket policies to restrict access
   - Use presigned URLs with appropriate expiration times

4. **Database Security**

   - Change default PostgreSQL credentials in `docker-compose.yml` for production
   - Use strong passwords (minimum 16 characters, mixed case, numbers, symbols)
   - Restrict database access to application servers only
   - Enable SSL/TLS for database connections in production

5. **CORS Configuration**

   - Only allow specific origins, not `*` in production
   - Update `AllowedOrigins` in S3 CORS to match your production frontend URL
   - Regularly review and update CORS policies

6. **File Upload Security**
   - Validate file types and sizes on both client and server
   - Scan uploaded files for malware (consider AWS Lambda + ClamAV)
   - Store sensitive files with encryption at rest
   - Implement rate limiting on upload endpoints

### Checklist Before Production

- [ ] Changed all default passwords and credentials
- [ ] Updated `DATABASE_URL` with production database
- [ ] Configured production S3 bucket with proper CORS
- [ ] Updated `CORS_ORIGIN` to production frontend URL
- [ ] Verified `.env` files are in `.gitignore` and not committed
- [ ] Set up proper IAM roles and policies for S3
- [ ] Enabled database SSL/TLS connections
- [ ] Configured proper logging and monitoring
- [ ] Set up backup strategy for database
- [ ] Implemented rate limiting and DDoS protection

## License

MIT
