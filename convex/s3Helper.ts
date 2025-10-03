export async function uploadToS3(args: {
  content: Uint8Array;
  filename: string;
  contentType: string;
}): Promise<{ url: string; cdnUrl: string }> {
  const region = process.env.AWS_REGION || 'us-east-1';
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const bucket = process.env.S3_BUCKET_NAME!;
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const cdnDomain = process.env.CLOUDFRONT_DOMAIN!;

  const key = `images/${args.filename}`;

  // Use AWS Signature V4 with native fetch
  const { signedUrl, headers } = await createSignedPutRequest({
    region,
    bucket,
    key,
    accessKeyId,
    secretAccessKey,
    contentType: args.contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers,
    // @ts-ignore
    body: args.content.buffer,
  });

  if (!response.ok) {
    throw new Error(
      `S3 upload failed: ${response.status} ${response.statusText}`
    );
  }

  const cdnUrl = `https://${cdnDomain}/${key}`;
  const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  return {
    url: s3Url,
    cdnUrl,
  };
}

async function createSignedPutRequest(params: {
  region: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  contentType: string;
  cacheControl: string;
}): Promise<{ signedUrl: string; headers: Record<string, string> }> {
  const {
    region,
    bucket,
    key,
    accessKeyId,
    secretAccessKey,
    contentType,
    cacheControl,
  } = params;

  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const url = `https://${host}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const headers: Record<string, string> = {
    host: host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'content-type': contentType,
    'cache-control': cacheControl,
  };

  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k.toLowerCase()}:${headers[k]}\n`)
    .join('');

  const signedHeaders = Object.keys(headers)
    .sort()
    .map((k) => k.toLowerCase())
    .join(';');

  const canonicalUri = `/${key.split('/').map(encodeURIComponent).join('/')}`;

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');

  const signingKey = await getSignatureKey(
    secretAccessKey,
    dateStamp,
    region,
    service
  );
  const signature = await hmacHex(signingKey, stringToSign);

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  headers.Authorization = authorizationHeader;

  return { signedUrl: url, headers };
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  // @ts-ignore
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// @ts-ignore
async function hmac(
  key: Uint8Array | string,
  message: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyData = typeof key === 'string' ? encoder.encode(key) : key;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    // @ts-ignore
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // @ts-ignore
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(message)
  );
  return new Uint8Array(signature);
}

async function hmacHex(key: Uint8Array, message: string): Promise<string> {
  const signature = await hmac(key, message);
  return Array.from(signature)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<Uint8Array> {
  const kDate = await hmac(`AWS4${key}`, dateStamp);
  const kRegion = await hmac(kDate, regionName);
  const kService = await hmac(kRegion, serviceName);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}
