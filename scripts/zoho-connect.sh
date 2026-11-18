#!/bin/zsh
# Connect FactoryOS (and its Warehouse) to Zoho Books.
# Run by Arjun whenever the permissions need to change. Values are typed here
# (secret + code hidden), exchanged with Zoho for a refresh token, and written
# straight to Vercel (production) and .env.local. Nothing is printed or saved
# anywhere else.
#
# In the Zoho API console (api-console.zoho.in → Self Client → Generate Code),
# use this scope line. It is read-only except the last entry, which lets the
# warehouse tick "Delivery Acknowledgment" on an invoice; leave that one off to
# stay fully read-only.
#   ZohoBooks.salesorders.READ,ZohoBooks.invoices.READ,ZohoBooks.purchaseorders.READ,ZohoBooks.settings.READ,ZohoBooks.invoices.UPDATE
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Zoho -> FactoryOS + Warehouse connection (org 60004253439, India)"
read "CID?1) Client ID: "
read -s "CSEC?2) Client Secret (hidden): "; echo
echo "   Now tell Claude 'ready for code'. Paste the code once it says it is copied."
read -s "CODE?3) Generated code (hidden): "; echo
CODE="${CODE//[[:space:]]/}"; CID="${CID//[[:space:]]/}"; CSEC="${CSEC//[[:space:]]/}"
echo "   (code received: ${#CODE} characters)"

RESP=$(curl -s -X POST "https://accounts.zoho.in/oauth/v2/token" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "client_id=$CID" \
  --data-urlencode "client_secret=$CSEC" \
  --data-urlencode "code=$CODE")
RT=$(printf '%s' "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("refresh_token",""))')
if [[ -z "$RT" ]]; then
  ERR=$(printf '%s' "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("error","unknown error"))')
  echo "Zoho refused the code: $ERR  (codes expire in minutes and work once; generate a new one and re-run)"
  exit 1
fi

# Quick read-only test: fetch one sales order number.
AT=$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')
TEST=$(curl -s "https://www.zohoapis.in/books/v3/salesorders?organization_id=60004253439&per_page=1" \
  -H "Authorization: Zoho-oauthtoken $AT" | python3 -c 'import sys,json; d=json.load(sys.stdin); s=d.get("salesorders") or []; print(s[0]["salesorder_number"] if s else "NO ACCESS: "+str(d.get("message")))')
echo "Test read, sales orders: $TEST"
for KIND in invoices purchaseorders; do
  T=$(curl -s "https://www.zohoapis.in/books/v3/$KIND?organization_id=60004253439&per_page=1" \
    -H "Authorization: Zoho-oauthtoken $AT" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("ok" if d.get("code")==0 else "NO ACCESS: "+str(d.get("message")))')
  echo "Test read, $KIND: $T"
done

set_env () {  # name value
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
  if grep -q "^$1=" .env.local 2>/dev/null; then
    python3 - "$1" "$2" <<'PY'
import sys
k,v=sys.argv[1],sys.argv[2]
lines=open('.env.local').read().splitlines()
open('.env.local','w').write('\n'.join(f'{k}={v}' if l.startswith(k+'=') else l for l in lines)+'\n')
PY
  else
    printf '%s=%s\n' "$1" "$2" >> .env.local
  fi
}
set_env ZOHO_CLIENT_ID "$CID"
set_env ZOHO_CLIENT_SECRET "$CSEC"
set_env ZOHO_REFRESH_TOKEN "$RT"
set_env ZOHO_ORG_ID "60004253439"
set_env ZOHO_ACCOUNTS_URL "https://accounts.zoho.in"
set_env ZOHO_API_URL "https://www.zohoapis.in"
unset CSEC CODE RT AT RESP
echo "Saved to Vercel (production) and .env.local. Tell Claude: zoho connected."
