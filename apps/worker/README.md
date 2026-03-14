# F1 Ingestion Worker (Planned)

This folder is reserved for the Python ingestion service that will:

1. Fetch and normalize FastF1 session data
2. Upsert canonical records into Convex
3. Trigger summary recomputation flows

For now, the original desktop fetch logic remains in `f1_data_fetcher/`.
