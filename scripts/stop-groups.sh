#!/usr/bin/env bash
# Stops whole process groups by PGID (run via setsid so it never signals the caller).
for g in "$@"; do kill -- "-$g" 2>/dev/null; done
