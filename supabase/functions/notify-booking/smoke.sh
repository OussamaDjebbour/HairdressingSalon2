#!/bin/sh
# Smoke test for the local notify-booking function.
# Run `supabase functions serve --env-file supabase/functions/.env` first.
set -u
URL="${NOTIFY_URL:-http://127.0.0.1:54321/functions/v1/notify-booking}"
SECRET="$(grep '^NOTIFY_SECRET=' supabase/functions/.env | cut -d= -f2-)"
fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi
}
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' -d '{}')
check "no secret → 401" 401 "$code"
body=$(curl -s -X POST "$URL" -H 'Content-Type: application/json' -H "x-notify-secret: $SECRET" \
  -d '{"kind":"test","booking":null,"subscriptions":[]}')
check "empty subscriptions → 200 result" '{"sent":0,"failed":0,"pruned":[]}' "$body"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' -H "x-notify-secret: $SECRET" -d 'not json')
check "malformed body → 400" 400 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X GET "$URL" -H "x-notify-secret: $SECRET")
check "GET → 405" 405 "$code"
exit $fail
