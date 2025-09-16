# CLI Commands

## Environment Variables

### Load .env file into CLI context

```bash
# Load environment variables from .env file
export $(cat .env | xargs)
```

## Sync Folio Society releases

### Hit the cron endpoint for syncage

```bash
# Load env vars and hit the cron endpoint
export $(cat .env | xargs) && curl -X POST "http://localhost:1333/api/cron/sync-folio" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```
