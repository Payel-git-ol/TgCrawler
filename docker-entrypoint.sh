#!/bin/sh
set -e

echo "=== Starting TgCrawler ==="

# Generate Prisma client (ensures client matches current schema)
echo "Running prisma generate..."
npx prisma generate || echo "WARNING: prisma generate failed, using build-time generated client"

# Apply database migrations (requires DATABASE_URL and running database)
echo "Running prisma migrate deploy..."
npx prisma migrate deploy || echo "WARNING: prisma migrate deploy failed, app will create tables via SQL fallback"

# Start the application
echo "Starting application..."
exec node dist/index.js
