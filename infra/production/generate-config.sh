#!/bin/sh
set -eu
umask 077
[ "$(id -u)" = 0 ] || { echo 'Run as root on the new production host'; exit 1; }
[ "$(uname -s)" = Linux ] || { echo 'Linux production host required'; exit 1; }
private_dir=/etc/gongzhi/production
[ ! -e "$private_dir" ] || { echo 'Configuration exists; refuse overwrite or rotation'; exit 1; }
command -v openssl >/dev/null
command -v docker >/dev/null
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p /etc/gongzhi
mkdir -m 700 "$private_dir"
mkdir -m 755 "$private_dir/db-tls"
# CA key stays root-only and is never mounted into services.
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 \
  -keyout "$private_dir/ca.key" -out "$private_dir/db-tls/ca.crt" \
  -subj '/CN=gongzhi-production-db-ca' -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' >/dev/null 2>&1
openssl req -new -newkey rsa:3072 -nodes -sha256 \
  -keyout "$private_dir/db-tls/server.key" -out "$private_dir/server.csr" \
  -subj '/CN=db' >/dev/null 2>&1
cat > "$private_dir/server.ext" <<'EXT'
subjectAltName=DNS:db
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EXT
openssl x509 -req -in "$private_dir/server.csr" -CA "$private_dir/db-tls/ca.crt" \
  -CAkey "$private_dir/ca.key" -CAcreateserial -out "$private_dir/db-tls/server.crt" \
  -days 365 -sha256 -extfile "$private_dir/server.ext" >/dev/null 2>&1
chmod 644 "$private_dir/db-tls/ca.crt" "$private_dir/db-tls/server.crt"
# Debian pgvector image's postgres UID/GID; I verifies it before generating.
chown 999:999 "$private_dir/db-tls/server.key"
chmod 600 "$private_dir/db-tls/server.key"
docker run --rm --network none --user 0 \
  -v "$private_dir:/private" -v "$source_dir:/source:ro" \
  node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 \
  node /source/generate-env.mjs /private
echo 'Private configuration ready at /etc/gongzhi/production; no services started or users seeded'
