#!/bin/bash

# Test script for Larkx backend endpoints
# Usage: ./test-endpoints.sh [backend-url]

BACKEND_URL=${1:-"http://localhost:3000"}

echo "🧪 Testing Larkx Backend at $BACKEND_URL"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    
    echo -n "Testing $name: "
    
    if [ "$method" = "GET" ]; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    else
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
    fi
    
    if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
        echo -e "${GREEN}✓${NC} HTTP $HTTP_CODE"
        return 0
    elif [ "$HTTP_CODE" -ge 400 ] && [ "$HTTP_CODE" -lt 500 ]; then
        echo -e "${YELLOW}⚠${NC} HTTP $HTTP_CODE (Client Error)"
        return 1
    else
        echo -e "${RED}✗${NC} HTTP $HTTP_CODE"
        return 1
    fi
}

# Test endpoints
test_endpoint "Health/API Root" "$BACKEND_URL/api"
test_endpoint "Users List" "$BACKEND_URL/api/users"
test_endpoint "Organizations Current" "$BACKEND_URL/api/organizations/current"
test_endpoint "Swagger UI" "$BACKEND_URL/docs"
test_endpoint "Swagger JSON" "$BACKEND_URL/docs-json"

echo ""
echo "=========================================="
echo "✅ Endpoint testing complete!"
echo ""
echo "To view detailed responses, use:"
echo "  curl $BACKEND_URL/api"
echo "  curl $BACKEND_URL/api/users"
echo "  curl $BACKEND_URL/api/organizations/current"
echo ""
echo "Swagger UI: $BACKEND_URL/docs"

