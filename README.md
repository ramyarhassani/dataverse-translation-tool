# 🌐 Dataverse Translation Tool

**A Power Platform ToolBox (PPTB) tool for managing Dataverse solution translations.**

> By **Ramyar Hassani** — Denmark

---

## Overview

The Dataverse Translation Tool allows you to export, view, edit, and import translations for any unmanaged Dataverse solution — directly inside Power Platform ToolBox. No more downloading Excel files, editing offline, and re-uploading manually.

### Key Features

- **One-click export** — Exports the full translation file from any unmanaged solution
- **Smart language detection** — Automatically detects provisioned languages in your environment
- **Inline editing** — Edit translations directly in the table, with Tab navigation between cells
- **Categorized view** — Items grouped by type: Attributes, OptionSets, Forms, Views, Commands, Entity Labels
- **Entity sidebar** — Filter by entity with missing-translation counts
- **Solution picker** — Dropdown of all unmanaged solutions, with reload button
- **Metadata resolution** — Resolves GUIDs to human-readable names (form tabs, sections, views, etc.)
- **Import with validation** — Validates 500-character limit, polls import job status, publishes automatically
- **44 languages supported** — All Dataverse-supported languages
- **Dark/Light theme** — Follows PPTB theme settings
- **Debug log** — Real-time activity log for troubleshooting

---

## How It Works

### Export Flow

1. Select a solution from the dropdown
2. Click **"Export & Load"**
3. The tool calls `ExportTranslation` (bound to the solution entity) via the Dataverse API
4. Receives a ZIP containing `CrmTranslations.xml` in SpreadsheetML format
5. Parses the XML, extracts all translatable labels (English + target language)
6. Resolves Object IDs to meaningful types using metadata APIs (in parallel)
7. Categorizes and displays items in the table

### Edit Flow

1. Browse items using the entity sidebar and category tabs
2. Use "Show only missing" toggle to focus on untranslated items
3. Type translations directly in the Target column
4. Use the 📋 button to copy English text to clipboard
5. Use "Copy All English" to bulk-copy for AI translation workflows

### Import Flow

1. Click **"Import"** when you have translations to save
2. The tool:
   - Validates all translations (skips items exceeding 500 characters)
   - Applies all changes to the XML in a single batch operation
   - Re-packs the ZIP file
   - Calls `ImportTranslation` with the modified ZIP
   - Polls the import job status until complete
   - Calls `PublishAllXml` to publish all customizations
3. Done! Translations are live in your environment

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Power Platform ToolBox (Electron)                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  BrowserView (sandboxed)                                  │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐   │  │
│  │  │  main.ts    │  │  Services    │  │  Components    │   │  │
│  │  │  (app core) │──│  • export    │  │  • toolbar     │   │  │
│  │  │             │  │  • import    │  │  • sidebar     │   │  │
│  │  │             │  │  • metadata  │  │  • table       │   │  │
│  │  │             │  │  • language  │  │  • tab-bar     │   │  │
│  │  └─────────────┘  └──────────────┘  │  • debug-log   │   │  │
│  │         │                            │  • loading     │   │  │
│  │         ▼                            └────────────────┘   │  │
│  │  ┌─────────────────────────────┐                          │  │
│  │  │  window.dataverseAPI        │ ← Injected by PPTB      │  │
│  │  │  window.toolboxAPI          │                          │  │
│  │  └─────────────────────────────┘                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Build | Vite 7 + TypeScript |
| UI | Vanilla HTML/CSS (Fluent UI-inspired tokens) |
| ZIP handling | JSZip |
| XML parsing | DOMParser (SpreadsheetML) |
| API | `@pptb/types ^1.2.0` (window.dataverseAPI / window.toolboxAPI) |
| Theme | CSS custom properties + `data-theme` attribute |

### File Structure

```
src/
├── main.ts                      # App orchestration, state, event handlers
├── style.css                    # Fluent UI theme tokens + all styles
├── types.ts                     # TypeScript interfaces
├── services/
│   ├── translation-export.ts    # ExportTranslation API call + XML parsing
│   ├── translation-import.ts    # Batch XML update + ImportTranslation + publish
│   ├── metadata-resolver.ts     # Parallel GUID → type resolution (5 concurrent)
│   └── language-service.ts      # 44 languages, provisioned language detection
├── components/
│   ├── toolbar.ts               # Language dropdown, search, filters
│   ├── sidebar.ts               # Entity list with missing counts
│   ├── table.ts                 # Translation table with inline editing
│   ├── tab-bar.ts               # Category tabs with badges
│   ├── loading-overlay.ts       # Full-screen spinner with timer
│   └── debug-log.ts             # Collapsible activity log
└── utils/
    ├── xml-parser.ts            # SpreadsheetML parse/update/repack
    ├── categorizer.ts           # Item → category mapping
    └── retry.ts                 # Exponential backoff retry wrapper
```

---

## Dataverse APIs Used

| Action | Purpose |
|--------|---------|
| `ExportTranslation` (bound to solution) | Export translation ZIP |
| `ImportTranslation` | Import modified translation ZIP |
| `PublishAllXml` | Publish all customizations after import |
| `RetrieveProvisionedLanguages` | Detect available languages |
| `queryData('solutions')` | List unmanaged solutions for picker |
| `queryData('importjobs')` | Poll import job progress |
| `getEntityMetadata` | Resolve entity MetadataId |
| `getEntityRelatedMetadata` | Resolve attribute MetadataId |
| `queryData('EntityDefinitions/.../PicklistAttributeMetadata')` | Resolve OptionSet values |
| `queryData('systemforms')` | Resolve Form/Tab/Section GUIDs |
| `queryData('savedqueries')` | Resolve View GUIDs |

---

## Performance Optimizations

- **Cached ZIP re-parsing** — Switching language doesn't re-fetch from Dataverse (~75s saved)
- **Batch XML updates** — Single DOM parse/serialize for all cell changes (vs. N parses)
- **Parallel metadata** — 5 entities resolved concurrently, 6 API calls per entity in parallel
- **Main forms only** — Only fetches Main forms (type=2) for FormXML parsing
- **Retry with backoff** — Handles API throttling gracefully
- **Fixed table layout** — Renders 9000+ rows without layout thrashing

---

## Installation

### Requirements

- [Power Platform ToolBox](https://www.powerplatformtoolbox.com/) v1.2.0 or later
- A Dataverse connection configured in PPTB
- At least one provisioned language besides English in your environment

### Install from PPTB Store

*(Coming soon)*

### Load Locally (Development)

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build:
   ```bash
   npm run build
   ```
4. In PPTB: **Debug → Load Local Tool** → select the `dist/` folder

---

## Development

```bash
# Install dependencies
npm install

# Type-check
npx tsc --noEmit

# Build for production
npm run build

# Output is in dist/ — ready to load in PPTB
```

### Environment

- Node.js 18+
- npm 9+
- TypeScript 5.x
- Vite 7.x

---

## Translation File Format

The exported ZIP contains `CrmTranslations.xml` in Microsoft's SpreadsheetML format:

| Worksheet | Content |
|-----------|---------|
| Information | Export metadata (skipped) |
| Display Strings | Entity display names, descriptions |
| Localized Labels | All labels: attributes, forms, views, commands, options |

**Column structure:**
- `Entity` — Entity logical name
- `Object ID` — GUID referencing the component
- `Object Column Name` — Type context (DisplayName, Description, etc.)
- `LCID:1033` — English (base language)
- `LCID:xxxx` — Target language column

---

## Limitations

- Export/Import operates on the **entire solution** (Microsoft limitation)
- `PublishAllXml` publishes all customizations (not just translations)
- Maximum 500 characters per translated string (Dataverse limit)
- Export can take 30-120 seconds for large solutions
- Requires PPTB v1.2.0+ (`type="module"` support)

---

## License

MIT

---

## Credits

Built by **Ramyar Hassani** — Denmark 🇩🇰

Built for [Power Platform ToolBox](https://www.powerplatformtoolbox.com/)

