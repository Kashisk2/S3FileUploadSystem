# Database Setup Guide

## ✅ Database is Now Running!

Your local PostgreSQL database is set up and connected.

## Quick Commands

```bash
# Start database
docker-compose up -d postgres

# Stop database
docker-compose down

# View database in Prisma Studio
cd packages/server && npm run db:studio

# Push schema changes
cd packages/server && npm run db:push

# Generate Prisma client
cd packages/server && npm run db:generate
```

## Database Connection Details

- **Host**: localhost
- **Port**: 5432
- **Database**: s3_uploads
- **Username**: s3upload
- **Password**: s3upload123
- **Connection String**: `postgresql://s3upload:s3upload123@localhost:5432/s3_uploads`

## Database Tables

The following tables have been created:

1. **file_assets** - Stores file metadata and asset information
2. **upload_sessions** - Tracks multipart upload progress

## Viewing Data

### Using Prisma Studio (GUI)

```bash
cd packages/server
npm run db:studio
```

This opens a web interface at `http://localhost:5555`

### Using psql (Command Line)

```bash
docker exec -it s3-upload-db psql -U s3upload -d s3_uploads
```

## Environment Variables

Make sure your `packages/server/.env` file has:

```env
DATABASE_URL=postgresql://s3upload:s3upload123@localhost:5432/s3_uploads
```

## Troubleshooting

### Database not starting?

```bash
# Check if container is running
docker ps | grep s3-upload-db

# View logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Connection refused?

- Make sure Docker is running
- Check if port 5432 is available
- Verify the container is running: `docker ps`

### Reset database

```bash
# Stop and remove container + data
docker-compose down -v

# Start fresh
docker-compose up -d postgres
sleep 5
cd packages/server && npm run db:push
```
