# AGENTS.md — Dataverse Translation Tool (PPTB)

> Denne fil beskriver alt om projektet, så enhver ny chat/agent kan fortsætte arbejdet.

---

## Projekt Info

| Felt | Værdi |
|------|-------|
| **Navn** | Dataverse Translation Tool |
| **Type** | Power Platform ToolBox (PPTB) tool |
| **Forfatter** | Ramyar Hassani - Denmark |
| **Placering** | `C:\Users\ramyarhassani\Downloads\pptb-dataverse-translation-tool\` |
| **Original C# reference** | `C:\Users\ramyarhassani\Downloads\DataverseTranslationTool\TranslationService.cs` |
| **Tech stack** | TypeScript + Vite 7 + vanilla HTML/CSS + JSZip |
| **UI framework** | Ingen (vanilla DOM med Fluent UI CSS tokens) |
| **Build output** | `dist/` folder → load i PPTB via Debug → Load Local Tool |
| **PPTB min version** | 1.2.0 |

---

## Hvad er PPTB?

Power Platform ToolBox er en **Electron-baseret desktop app** hvor tools kører som web apps i sandboxed BrowserViews. PPTB injicerer:
- `window.toolboxAPI` — settings, notifications, theme, events, file system
- `window.dataverseAPI` — Dataverse CRUD, metadata, execute actions

Tools er npm packages med en `package.json` der fungerer som manifest.

---

## Arkitektur

```
src/
├── main.ts                      # App orchestration, state, event handlers
├── style.css                    # Fluent UI theme tokens (~900 lines)
├── types.ts                     # TranslationItem, TranslationCategory, LanguageOption
├── services/
│   ├── translation-export.ts    # ExportTranslation (bound to solution entity)
│   ├── translation-import.ts    # Batch XML update + ImportTranslation + poll + publish
│   ├── metadata-resolver.ts     # Parallel GUID → type resolution (5 concurrent entities)
│   └── language-service.ts      # 44 languages, RetrieveProvisionedLanguages API
├── components/
│   ├── toolbar.ts               # Language dropdown, search, missing-only toggle
│   ├── sidebar.ts               # Entity list with missing counts + tooltips
│   ├── table.ts                 # Translation table with inline editing + Tab nav
│   ├── tab-bar.ts               # Category tabs (All/Attributes/OptionSets/Forms/Views/Commands/Entity/Other)
│   ├── loading-overlay.ts       # Full-screen spinner with elapsed timer
│   └── debug-log.ts             # Collapsible real-time activity log
└── utils/
    ├── xml-parser.ts            # SpreadsheetML parse + batchUpdateXmlCells + repackZip
    ├── categorizer.ts           # Item → category mapping
    └── retry.ts                 # Exponential backoff retry wrapper
```

---

## Vigtige Tekniske Beslutninger

### ExportTranslation
- **Kun approach 2 virker**: bound to solution entity (`entityName: 'solution'`)
- Approach 1 (unbound) fejler ALTID med `0x80060888: Resource not found`
- Export tager 30-120 sekunder for store solutions
- Returnerer ZIP med `CrmTranslations.xml` i SpreadsheetML format

### ImportTranslation
- **Batch XML updates**: Parser XML DOM én gang → applyer alle ændringer → serializer én gang
- **500-tegn grænse**: Microsoft afviser translations >500 chars — vi validerer og skipper
- **Poll ImportJob**: `importjobs(id)?$select=progress,completedon` hver 2s (max 60s)
- **PublishAllXml** efter import (Microsoft's officielle anbefaling)

### Metadata Resolution
- Kører i **parallelle batches** (5 entities ad gangen)
- Per entity: 6 API calls i parallel via `Promise.allSettled()`
- Kun **Main forms** (type=2) hentes for FormXML parsing
- Resolver: Entity → Attribute → OptionSet → Form/Tab/Section/Cell → View → Command

### Sprog
- **44 sprog** understøttet (alle Dataverse-sprog)
- `RetrieveProvisionedLanguages` API kaldes ved init for at detektere tilgængelige sprog
- Dropdown viser KUN provisioned languages
- Auto-detect fra ZIP headers som fallback
- Cached ZIP re-parsing ved sprogskift (sparer ~75s re-fetch)

### Solution Picker
- `<select>` dropdown (IKKE input+datalist — brugeren vil have en rigtig dropdown med pil)
- Henter: `solutions?$filter=ismanaged eq false and isvisible eq true`
- 🔄 reload-knap ved siden af
- Auto-vælger sidst brugte eller første solution

### Theme
- Følger PPTB theme via `toolboxAPI.utils.getCurrentTheme()`
- `data-theme="dark"` attribut på `<html>`
- CSS media query som fallback
- Lytter på `settings:updated` event for live theme-skift

---

## PPTB API Shapes (VIGTIGT)

```typescript
// Notifications — IKKE `message`, det er `body`!
toolboxAPI.utils.showNotification({ title: string, body: string, type?: string, duration?: number })

// Connection — `.url` IKKE `.environmentUrl`
const conn = await toolboxAPI.connections.getActiveConnection();
conn.url // "https://org.crm4.dynamics.com"

// Events
toolboxAPI.events.on((event, payload: { event: string }) => { ... })
toolboxAPI.events.off(handler) // cleanup

// Settings — namespaced keys
toolboxAPI.settings.get('translation-tool:lastSolution')
toolboxAPI.settings.set('translation-tool:targetLanguage', value)

// Metadata — complex OData paths bruger queryData, IKKE getEntityRelatedMetadata
dataverseAPI.queryData(`EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`)
```

---

## package.json Manifest (PPTB-specifikt)

```json
{
  "name": "@pptb/dataverse-translation-tool",
  "displayName": "Dataverse Translation Tool",
  "author": "Ramyar Hassani - Denmark",
  "main": "index.html",
  "icon": "icons/tool.svg",
  "features": { "multiConnection": "none", "minAPI": "1.2.0" },
  "configurations": {
    "repository": "https://github.com/ramyarhassani/pptb-dataverse-translation-tool",
    "readmeUrl": "https://raw.githubusercontent.com/.../README.md",
    "website": "..."
  }
}
```

---

## Vite Config

- Standard Vite build (IKKE library mode, IKKE IIFE)
- `type="module"` virker i PPTB 1.2.x
- Plugin: fjerner `crossorigin` attributter fra script/link tags
- Plugin: kopierer `package.json` til `dist/`
- `base: './'` for relative paths

---

## Kendte Problemer / Gotchas

1. **crossorigin attribut** — Vite tilføjer den, PPTB fejler med den → plugin fjerner den
2. **PPTB cacher metadata** — Skal fjerne + genindlæse tool for at se package.json ændringer
3. **README i PPTB** — Kræver live GitHub URL (virker ikke lokalt)
4. **Export 0 items** — Betyder target LCID ikke findes i ZIP → auto-switch til tilgængeligt sprog
5. **3 døde export approaches** — FJERNET. Kun bound-to-solution virker.
6. **`toolboxAPI.utils.showLoading()`** — EKSISTERER IKKE trods docs. Brug eget overlay.

---

## UI Design Aftaler

- **Sprog**: Alt UI-tekst er på ENGELSK (tool skal releases internationalt)
- **Theme**: Følger PPTB (dark/light), IKKE hardcoded
- **Solution picker**: Rigtig `<select>` dropdown med pil + reload-knap
- **Tabel**: Fixed layout, Context+English kolonner wrapper tekst, tooltips på hover
- **Sidebar**: Entity-navne trunkeres med ellipsis, tooltip med fuld tekst
- **Debug log**: Collapsible panel der viser alt hvad der sker
- **Loading**: Full-screen overlay med spinner + elapsed timer + step status

---

## Kategorier (Tabs)

| Tab | Matcher |
|-----|---------|
| All | Alt |
| Attributes | ObjectType = Attribute/Label/Description |
| OptionSets | ObjectType = OptionSet Value |
| Forms | ObjectType starter med "Form" |
| Views | ObjectType = View |
| Commands | ObjectType = Command |
| Entity Labels | ObjectType indeholder "Entity" |
| Other | Alt der ikke matcher |

---

## Build & Test

```bash
# Install
npm install

# Type-check
npx tsc --noEmit

# Build
npm run build

# Output → dist/ → load i PPTB via Debug → Load Local Tool → vælg dist/
```

---

## Dataverse Translation ZIP Format

ZIP indeholder `CrmTranslations.xml` i SpreadsheetML format:

| Worksheet | Indhold |
|-----------|---------|
| Information | Metadata (skippes) |
| Display Strings | Entity display names |
| Localized Labels | Alle labels (forms, views, commands, attributes, options) |

**Kolonner:**
- `Entity` — entity logical name
- `Object ID` — GUID
- `Object Column Name` — type (DisplayName, Description, LocalizedName, button*)
- `LCID:1033` — English (base)
- `LCID:xxxx` — Target language

**ss:Index gaps** — SpreadsheetML bruger sparse celler med `ss:Index` attribut. Parser SKAL håndtere dette.

---

## Fremtidige Forbedringer (Out of Scope)

- Export til Excel/CSV for eksterne oversættere
- Undo/diff preview før import
- Draft auto-save (gem hvert 5. sekund via settings API)
- "Changed since last translation" detection
- Selektiv publish (`PublishXml` med specifikke entities)
- Progress bar under metadata resolution (f.eks. "3/37 entities...")

---

## Reference Tools (Studeret)

1. **FetchXML Studio** (`mohsinonxrm/pptb-mxrm-fetchxml-studio`)
   - React 18 + Fluent UI v9 + Vite
   - `type: "module"` virker
   - Namespaced settings, `events.off()` cleanup
   
2. **Audit Restore** (`TheMarkChristie/PPTBAuditRestore`)
   - Single-file HTML, ingen framework
   - `pickOrgUrl()` med multiple fallback fields
   - Retry logic for throttling
   - `connection:updated` → reload

---

## Git

Repo er IKKE pushed til GitHub endnu. URL er reserveret:
`https://github.com/ramyarhassani/pptb-dataverse-translation-tool`

Når pushed: README vises i PPTB "See Details" via `configurations.readmeUrl`.

