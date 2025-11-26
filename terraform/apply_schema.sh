#!/bin/bash

# Script to apply database schema to RDS instance
# Usage: ./apply_schema.sh <rds_endpoint> <username> <database_name>

set -e

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <rds_endpoint> <username> <database_name>"
    echo "Example: $0 larkx-db-dev.xxxxx.us-east-1.rds.amazonaws.com larkx_admin larkx"
    exit 1
fi

RDS_ENDPOINT=$1
USERNAME=$2
DATABASE=$3

echo "Applying database schema to $DATABASE on $RDS_ENDPOINT..."
echo "You will be prompted for the database password."

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "Error: psql is not installed."
    echo "Install PostgreSQL client: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
    exit 1
fi

# Apply schema
PGPASSWORD="${DATABASE_PASSWORD:-}" psql -h "$RDS_ENDPOINT" -U "$USERNAME" -d "$DATABASE" -f database_schema.sql

echo "Schema applied successfully!"

