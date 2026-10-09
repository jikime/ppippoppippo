#!/usr/bin/env bash
# Explicit operator action only. Uploads a previously reviewed static build.
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo 'Usage: bash deploy-frontend.sh PATH_TO_DIST_AWS_WEB FRONTEND_BUCKET CLOUDFRONT_DISTRIBUTION_ID' >&2
  exit 2
fi
SOURCE_DIR=$(cd -- "$1" && pwd -P)
FRONTEND_BUCKET=$2
DISTRIBUTION_ID=$3
[[ -f $SOURCE_DIR/index.html ]] || { echo 'The supplied build must contain index.html.' >&2; exit 1; }
[[ $FRONTEND_BUCKET =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || { echo 'Invalid frontend bucket name.' >&2; exit 1; }
[[ $DISTRIBUTION_ID =~ ^[A-Z0-9]+$ ]] || { echo 'Invalid CloudFront distribution ID.' >&2; exit 1; }
command -v aws >/dev/null || { echo 'AWS CLI is required.' >&2; exit 1; }

# Upload dependencies before the HTML entry point. Keep earlier hashed files for
# in-flight clients; removal is a separate reviewed maintenance operation.
aws s3 sync "$SOURCE_DIR/" "s3://$FRONTEND_BUCKET/" \
  --exclude index.html --cache-control 'public,max-age=3600' --only-show-errors
aws s3 cp "$SOURCE_DIR/index.html" "s3://$FRONTEND_BUCKET/index.html" \
  --content-type 'text/html; charset=utf-8' --cache-control 'no-cache,max-age=0,must-revalidate' --only-show-errors
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*'
echo 'Upload complete; CloudFront invalidation may take several minutes to finish.'
