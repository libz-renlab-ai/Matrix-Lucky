#!/usr/bin/env bash
# Inner per-scenario live watch — invoked by tmux windows that the
# `teamagent-statusline-demo.sh` orchestrator creates.
#
# Each invocation watches ONE scenario by re-running the production
# `scripts/teamagent-statusline.cjs` script every 2s with controlled
# HOME/cwd, then drawing a header + the resulting status line.
#
# Usage: teamagent-statusline-demo-watch.sh <scenario>
#   <scenario> = full-state | missing-project-db | global-only | no-db
set -u

SANDBOX="${TEAMAGENT_DEMO_SANDBOX:?TEAMAGENT_DEMO_SANDBOX must be set}"
STATUSLINE="${TEAMAGENT_DEMO_STATUSLINE:?TEAMAGENT_DEMO_STATUSLINE must be set}"
SCENARIO="${1:-full-state}"

case "$SCENARIO" in
  full-state)         CWD="$SANDBOX/project"          ; HOMED="$SANDBOX/home" ;;
  missing-project-db) CWD="$SANDBOX/project-no-db"    ; HOMED="$SANDBOX/home" ;;
  global-only)        CWD="$SANDBOX/non-project"      ; HOMED="$SANDBOX/home" ;;
  no-db)              CWD="$SANDBOX/empty-non-project"; HOMED="$SANDBOX/empty-home" ;;
  *) printf 'unknown scenario: %s\n' "$SCENARIO" >&2; exit 1 ;;
esac

CYAN='\033[1;36m'; YEL='\033[1;33m'; GRN='\033[1;32m'; DIM='\033[2m'; RST='\033[0m'

while true; do
  clear
  printf "${CYAN}╔═══════════════════════════════════════════════════════════════╗${RST}\n"
  printf "${CYAN}║  TeamAgent statusline — live watch                            ║${RST}\n"
  printf "${CYAN}║  scenario: ${YEL}%-50s${CYAN}    ║${RST}\n" "$SCENARIO"
  printf "${CYAN}║  cwd:      ${DIM}%-50s${CYAN}    ║${RST}\n" "$CWD"
  printf "${CYAN}║  HOME:     ${DIM}%-50s${CYAN}    ║${RST}\n" "$HOMED"
  printf "${CYAN}╚═══════════════════════════════════════════════════════════════╝${RST}\n"
  printf "\n${GRN}▶ live status line (refreshes every 2s, %s):${RST}\n\n" "$(date '+%H:%M:%S')"
  printf "    "
  ( cd "$CWD" && HOME="$HOMED" node "$STATUSLINE" 2>/dev/null )
  printf "\n\n${DIM}↑ this is exactly what Claude Code renders at the bottom of its TUI.${RST}\n"
  printf "${DIM}Ctrl+B then n/p to switch windows · Ctrl+B then d to detach.${RST}\n"
  sleep 2
done
