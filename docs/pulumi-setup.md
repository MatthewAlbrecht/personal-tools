# Pulumi Infrastructure Setup

Dead simple AWS infra with Pulumi—no magic globals, no generated config bullshit.

## Prerequisites

1. **Install Pulumi CLI**:

   ```bash
   brew install pulumi
   ```

2. **Configure AWS credentials**:
   ```bash
   aws configure
   ```

## Deploy

1. **Initialize Pulumi stack**:

   ```bash
   cd infra
   pulumi login  # Use local filesystem or pulumi.com
   pulumi stack init dev
   pulumi config set aws:region us-east-1
   ```

2. **Deploy everything**:

   ```bash
   pnpm infra:up
   ```

3. **Get outputs**:

   ```bash
   pulumi stack output
   ```

   You'll see:

   ```
   bucketName: personal-tools-images-abc123
   cdnDomain: d123abc.cloudfront.net
   awsAccessKeyId: AKIA...
   awsSecretAccessKey: <sensitive>
   ```

4. **Export secrets**:
   ```bash
   pulumi stack output awsSecretAccessKey --show-secrets
   ```

## Add to Vercel

In your Vercel project environment variables:

```
AWS_ACCESS_KEY_ID=<from pulumi output>
AWS_SECRET_ACCESS_KEY=<from pulumi output --show-secrets>
AWS_REGION=us-east-1
S3_BUCKET_NAME=<from pulumi output bucketName>
CLOUDFRONT_DOMAIN=<from pulumi output cdnDomain>
```

## Usage in Next.js

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '~/env.js';

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// Upload
await s3.send(
  new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: `images/${filename}`,
    Body: buffer,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  })
);

// Serve via CloudFront
const url = `https://${env.CLOUDFRONT_DOMAIN}/images/${filename}`;
```

## What Gets Created

- **S3 Bucket**: Private, versioned, encrypted
- **CloudFront Distribution**: Global CDN with caching
- **IAM User + Access Key**: Scoped permissions for uploads only
- **Lifecycle Rules**: Auto-cleanup of incomplete uploads and old versions

## Preview Changes

```bash
pnpm infra:preview
```

## Destroy Everything

```bash
pnpm infra:destroy
```

Pulumi will ask for confirmation before nuking anything.
