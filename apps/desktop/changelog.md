# Changelog

## 0.4.0 - 2026-05-27

### Excel & Data Tools (18 new MCP tools)
- Added `excel_get_schema` — reads headers, column types, and sheet metadata without sending row data to AI.
- Added `excel_read_sample_rows` — returns N sample rows with optional offset.
- Added `excel_query_rows` — runs in-memory SQL SELECT on any sheet via alasql (table name: `data`).
- Added `excel_bulk_update` — batch cell updates by address (e.g. `D2`, `E5`).
- Added `excel_apply_formula` — applies a formula across a row range with auto-incremented row references.
- Added `excel_generate_summary` — group-by aggregations (sum/avg/min/max) computed locally.
- Added `excel_detect_anomalies` — detects empty rows, missing values, duplicates, and statistical outliers.
- Added `excel_export_xlsx` — creates styled .xlsx from JSON with bold headers, zebra rows, auto-width, frozen row, and autoFilter.
- Added `excel_convert_to_json` — exports sheet(s) to JSON, optionally saving to a file.
- Added `excel_ai_map_columns` — fuzzy-matches sheet columns to a caller-supplied target schema using token overlap scoring.
- Added `excel_merge_sheets` — merges columns from multiple files by row index or key JOIN.
- Added `excel_add_charts` — embeds bar/line/pie/doughnut chart images generated via QuickChart.
- Added `excel_scan_formula_errors` — scans all cells for `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, and `#N/A`.
- Added `excel_validate_formats` — validates columns against built-in patterns (PAN, GSTIN, email, phone, IFSC, date) or custom regex.
- Added `excel_split_by_column` — splits rows by column value into separate files or sheets.
- Added `excel_to_sql` — generates `CREATE TABLE` + batched `INSERT INTO` SQL for mysql/postgresql/sqlite.
- Added `pdf_extract_tables` — extracts tables from PDF files and exports each as an Excel sheet.
- Added `xml_to_excel` — converts XML files to Excel by auto-detecting repeating record elements.
- Added shared `excel-utils.js` with token-savings estimation, workbook loading, and type inference helpers.

### AI Tool Routing & Intelligence
- Integrated Anthropic `advanced-tool-use-2025-11-20` beta with `tool_search_tool_regex` — Claude can now search all 56+ tools by regex instead of receiving all definitions upfront.
- Rewrote tool router: Excel/PDF/XML/SQL/chart intents each map to the exact relevant tool subset; `read_file` no longer included for spreadsheet queries.
- Increased `MAX_TOOLS` from 10 to 20 to support richer multi-tool workflows.
- Raised `max_tokens` from 1024 to 4096 to eliminate tool-call truncation loops.
- Changed runaway-loop guard to track by `(tool + args)` fingerprint — the same tool called with different arguments (e.g. multiple SQL queries) is no longer incorrectly blocked.
- Added per-iteration token logging: input, output, cache_create, cache_read, and billed totals.
- Added system-prompt guardrails preventing `read_file` on binary spreadsheet formats.

### Chat UI
- File paths mentioned in assistant messages are now auto-detected and rendered as inline chips with a one-click **Open** button that launches the file or folder in the OS default app.
- Added `tool_search` stream chunk type with a live ⚡ badge showing the regex and number of tools matched.
- Added `toolRegex` and `toolsMatched` fields to `StreamChunk` contract.

## 0.3.0 - 2026-05-26

- Added a desktop Photo Finder panel with drag-and-drop image upload.
- Added system-wide similar image search across local drives and connected USB/external disks.
- Integrated deterministic image matching with perceptual hashing and OCR fallback.
- Added result actions to open images, open folders, and copy file paths.
- Enhanced app-opening support to resolve and launch local targets from the dashboard.

## 0.2.0 - 2026-05-25

- Added tray-backed compact window mode on Windows.
- Kept the existing full-size desktop window available.
- Restored packaged auto-update support.
- Added Windows admin elevation for the installer.

## 0.1.0 - 2026-05-23

- Initial desktop app release with local-first auth, chat, settings, and MCP integration.
