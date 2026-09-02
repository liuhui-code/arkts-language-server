#!/bin/sh

set -eu

audit_path=${ARKTS_INDEX_TEST_AUDIT:?}
scenario=${ARKTS_INDEX_TEST_SCENARIO:-silent-initialize}
request_count=0

on_term() {
  printf '%s\n' '{"event":"terminated","signal":"SIGTERM"}' >> "$audit_path"
  if [ "$scenario" = silent-shutdown-ignore-term ]; then
    return
  fi
  exit 0
}

trap on_term TERM
printf '%s\n' "{\"event\":\"started\",\"pid\":$$}" >> "$audit_path"

while IFS= read -r request; do
  request_count=$((request_count + 1))
  printf '%s\n' "{\"event\":\"request\",\"sequence\":$request_count}" >> "$audit_path"
  case "$scenario:$request_count" in
    silent-search:1|silent-shutdown:1|silent-shutdown-ignore-term:1)
      printf '%s\n' '{"protocol":1,"id":1,"ok":true,"result":{"workspaceIdentity":"file:///fixture","status":{"state":"warming","committedGeneration":0,"completeness":"stale","rejectedCount":0}}}'
      ;;
    silent-search:2)
      printf '%s\n' '{"protocol":1,"id":2,"ok":true,"result":{"status":{"state":"ready","committedGeneration":7,"completeness":"ready","rejectedCount":0},"rejectedDocuments":[]}}'
      ;;
    *)
      :
      ;;
  esac
done

if [ "$scenario" = silent-shutdown-ignore-term ]; then
  while :; do
    sleep 1
  done
fi
