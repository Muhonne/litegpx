# Web GPX Import And Editing

## Description

The web app imports existing GPX tracks for viewing, creates an editable copy when the user starts editing, and supports route-point insertion, dragging, deletion, undo, redo, and simplification.

## Code

- `web/src/app.js` handles file input, edit mode, point mutations, undo/redo history, simplification, and dirty route confirmation.
- `web/src/lib/gpx.js` parses GPX track points and exports edited GPX.
- `web/src/lib/geo.js` provides route distance and simplification distance calculations.
- `web/src/features/route-layers.js` exposes route point selection state to the map.
- `web/tests/manual/03-basic-editing.sh` covers imported route editing and point-list behavior.
- `web/tests/manual/12-simplify-route.sh` covers route simplification and undo.

## Scenario

```gherkin
Feature: Web GPX import and editing
  Scenario: Edit a copy of an imported track
    Given the user has imported a valid GPX track
    When the user presses "Edit route"
    Then the app creates an editable copy of the track
    And the user can drag, insert, delete, simplify, undo, and redo route points
    And rejecting or cancelling later destructive actions preserves unsaved edits
```
