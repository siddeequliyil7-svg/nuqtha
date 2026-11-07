# NUQTHA (നുഖ്ത)

A modern Malayalam personal publishing platform inspired by Risala Update.

## Project Structure
- `index.html`: The main publishing front-end layout with sticky black navbar, category filtering, hero lead section, and Most Read rankings.
- `styles.css`: Custom styling, typography (Anek Malayalam, Noto Sans Malayalam, Plus Jakarta Sans), and smooth transitions.
- `app.js`: Interactive article engine, search bar, category filtering, and modal article reader.
- `admin.html`: Admin publishing dashboard with form to publish articles directly.
- `.env`: API key configuration for Google Gemini / Google AI Studio.

## Roadmap
1. **Phase 1 (Completed)**: Responsive front-end UI, navigation, reader modal, and newsroom layout.
2. **Phase 2 (Next)**: Firebase Firestore cloud database integration for live publishing without touching code.

## Adding a button safely
- Give admin controls a unique tab-prefixed `id` where an ID is needed, and a `data-action` name handled by the stable `#admin-main-wrapper` listener in `admin.js`.
- Do not add inline `onclick` handlers or bind click listeners to rows that are replaced with `innerHTML`.
- For a collapsible panel, use a real button with `aria-expanded` and `aria-controls`; update both the attribute and the controlled panel's `hidden` state in the delegated handler.
- Escape Firestore text before inserting it into HTML, and use `textContent` for plain labels.
