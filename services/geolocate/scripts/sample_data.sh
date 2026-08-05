#!/usr/bin/env bash
# Compatibility wrapper: this helper was historically named sample_data.sh.
# The canonical implementation lives in scripts/build_data.sh.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build_data.sh" "$@"
