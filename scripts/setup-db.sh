#!/bin/bash

# Setup script for local database

echo "🗄️  Setting up local database..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start PostgreSQL container
echo "📦 Starting PostgreSQL container..."
docker-compose up -d postgres

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Check if database is ready
until docker exec s3-upload-db pg_isready -U s3upload > /dev/null 2>&1; do
    echo "   Still waiting..."
    sleep 2
done

echo "✅ Database is ready!"

# Navigate to server directory
cd packages/server

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run db:generate

# Push schema to database
echo "📊 Pushing database schema..."
npm run db:push

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Make sure your .env file has DATABASE_URL set"
echo "   2. Run 'npm run dev' to start the server"
echo "   3. Run 'npm run db:studio' to view the database"
echo ""
