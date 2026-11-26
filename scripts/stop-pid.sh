#!/usr/bin/env bash
# Stops the process group recorded in a pidfile (run via setsid so it never signals the caller).
for f in "$@"; do
  [ -f "$f" ] || continue
  pid="$(cat "$f")"
  pgid="$(ps -o pgid= "$pid" 2>/dev/null | tr -d ' ')"
  [ -n "$pgid" ] && kill -- "-$pgid" 2>/dev/null
  rm -f "$f"
done
