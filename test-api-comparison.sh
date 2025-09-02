#!/bin/bash

echo "Testing API endpoints for participant names..."
echo ""

ACCOUNT_EMAIL="naveendev@crossmilescarrier.com"

echo "1. Testing /account/:accountEmail/chats endpoint (frontend uses this):"
echo "Request: GET http://localhost:8080/account/$ACCOUNT_EMAIL/chats?limit=10"
RESPONSE1=$(curl -s "http://localhost:8080/account/$ACCOUNT_EMAIL/chats?limit=10")
echo "Response:"
echo "$RESPONSE1" | jq '.data.chats[] | select(.title == "Ravi" or .title == "Unknown Contact" or .title == "Google Drive Bot") | {title: .title, participants: .participants}'

echo ""
echo "2. Testing /test/account/:accountEmail/chats endpoint (our test endpoint):"
echo "Request: GET http://localhost:8080/test/account/$ACCOUNT_EMAIL/chats"
RESPONSE2=$(curl -s "http://localhost:8080/test/account/$ACCOUNT_EMAIL/chats")
echo "Response:"
echo "$RESPONSE2" | jq '.data.chats[] | select(.title == "Ravi" or .title == "Unknown Contact" or .title == "Google Drive Bot") | {title: .title, participants: .participants}'

echo ""
echo "3. Comparing response status:"
STATUS1=$(echo "$RESPONSE1" | jq -r '.status // "null"')
STATUS2=$(echo "$RESPONSE2" | jq -r '.status // "null"')
echo "Frontend API status: $STATUS1"
echo "Test API status: $STATUS2"

if [ "$STATUS1" != "true" ]; then
    echo "Frontend API error message:"
    echo "$RESPONSE1" | jq -r '.message // "No message"'
fi

echo ""
echo "Test completed!"
