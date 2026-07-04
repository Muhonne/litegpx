#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

agent-browser errors --clear >/dev/null 2>&1 || true
agent-browser console --clear >/dev/null 2>&1 || true
agent-browser open http://localhost:5173/web/
agent-browser wait 1500
agent-browser upload "#gpxInput" "$ROOT/web/tests/fixtures/simple-route.gpx"
agent-browser wait 800
agent-browser click "#editButton"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (!state.importedEditingCopy) throw new Error("Imported route did not create editable copy on first edit");
window.__trailLiteTest.addPoint(24.941, 60.172);
state = window.__trailLiteTest.getState();
if (state.points.length !== 4) throw new Error(`Expected 4 points after add, got ${state.points.length}`);
window.__trailLiteTest.insertPoint(2, 24.9405, 60.1715);
state = window.__trailLiteTest.getState();
if (state.points.length !== 5) throw new Error(`Expected 5 points after insert, got ${state.points.length}`);
'
agent-browser click "#undoButton"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (state.points.length !== 4) throw new Error(`Expected 4 points after undoing insert, got ${state.points.length}`);
'
agent-browser click "#pointsList li:first-child .point-delete"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (state.points.length !== 3) throw new Error(`Expected 3 points after delete, got ${state.points.length}`);
'
agent-browser click "#undoButton"
agent-browser eval '
let state = window.__trailLiteTest.getState();
if (state.points.length !== 4) throw new Error(`Expected 4 points after undoing delete, got ${state.points.length}`);
'
agent-browser click "#clearButton"
agent-browser eval '
const state = window.__trailLiteTest.getState();
if (state.points.length !== 0) throw new Error("Clear did not remove route points");
if (state.canExport) throw new Error("Cleared route should not export");
true;
'
