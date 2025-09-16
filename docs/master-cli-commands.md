# CLI Commands

## Sync Folio Society releases

### Hit the cron endpoint for syncage

```bash
curl -X POST "http://localhost:1333/api/cron/sync-folio" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```
