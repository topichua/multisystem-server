#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  echo "Running database migrations..."
  npm run migration:run:prod
fi

exec "$@"
