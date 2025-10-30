import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const stackName = pulumi.getStack();

// S3 bucket for images
const bucket = new aws.s3.Bucket("images-bucket", {
	bucketPrefix: "personal-tools-images-",
	tags: {
		Name: "Images Storage",
		Stack: stackName,
	},
});

// Enable versioning
new aws.s3.BucketVersioning("images-bucket-versioning", {
	bucket: bucket.id,
	versioningConfiguration: {
		status: "Enabled",
	},
});

// Block public access
new aws.s3.BucketPublicAccessBlock("images-bucket-public-access-block", {
	bucket: bucket.id,
	blockPublicAcls: true,
	blockPublicPolicy: true,
	ignorePublicAcls: true,
	restrictPublicBuckets: true,
});

// Server-side encryption
new aws.s3.BucketServerSideEncryptionConfiguration("images-bucket-encryption", {
	bucket: bucket.id,
	rules: [
		{
			applyServerSideEncryptionByDefault: {
				sseAlgorithm: "AES256",
			},
			bucketKeyEnabled: true,
		},
	],
});

// Lifecycle rules
new aws.s3.BucketLifecycleConfiguration("images-bucket-lifecycle", {
	bucket: bucket.id,
	rules: [
		{
			id: "abort-incomplete-multipart-uploads",
			status: "Enabled",
			abortIncompleteMultipartUpload: {
				daysAfterInitiation: 7,
			},
		},
		{
			id: "expire-old-versions",
			status: "Enabled",
			noncurrentVersionExpiration: {
				noncurrentDays: 30,
			},
		},
	],
});

// CORS configuration
new aws.s3.BucketCorsConfiguration("images-bucket-cors", {
	bucket: bucket.id,
	corsRules: [
		{
			allowedHeaders: ["*"],
			allowedMethods: ["GET", "HEAD"],
			allowedOrigins: ["*"],
			maxAgeSeconds: 86400,
		},
	],
});

// CloudFront Origin Access Identity
const oai = new aws.cloudfront.OriginAccessIdentity("images-oai", {
	comment: "OAI for images bucket",
});

// Bucket policy to allow CloudFront access
const bucketPolicy = new aws.s3.BucketPolicy("images-bucket-policy", {
	bucket: bucket.id,
	policy: pulumi.all([bucket.arn, oai.iamArn]).apply(([bucketArn, oaiArn]) =>
		JSON.stringify({
			Version: "2012-10-17",
			Statement: [
				{
					Sid: "AllowCloudFrontOAI",
					Effect: "Allow",
					Principal: {
						AWS: oaiArn,
					},
					Action: "s3:GetObject",
					Resource: `${bucketArn}/*`,
				},
			],
		}),
	),
});

// CloudFront distribution
const distribution = new aws.cloudfront.Distribution("images-cdn", {
	enabled: true,
	comment: "Images CDN",
	origins: [
		{
			domainName: bucket.bucketRegionalDomainName,
			originId: "s3-origin",
			s3OriginConfig: {
				originAccessIdentity: oai.cloudfrontAccessIdentityPath,
			},
		},
	],
	defaultCacheBehavior: {
		targetOriginId: "s3-origin",
		viewerProtocolPolicy: "redirect-to-https",
		allowedMethods: ["GET", "HEAD", "OPTIONS"],
		cachedMethods: ["GET", "HEAD"],
		compress: true,
		cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6", // AWS Managed CachingOptimized
	},
	restrictions: {
		geoRestriction: {
			restrictionType: "none",
		},
	},
	viewerCertificate: {
		cloudfrontDefaultCertificate: true,
	},
	tags: {
		Name: "Images CDN",
		Stack: stackName,
	},
});

// IAM user for programmatic access
const imageUploader = new aws.iam.User("image-uploader", {
	name: `personal-tools-image-uploader-${stackName}`,
	tags: {
		Purpose: "S3 image uploads",
	},
});

// IAM policy for S3 access
const uploaderPolicy = new aws.iam.UserPolicy("image-uploader-policy", {
	user: imageUploader.name,
	policy: bucket.arn.apply((bucketArn) =>
		JSON.stringify({
			Version: "2012-10-17",
			Statement: [
				{
					Effect: "Allow",
					Action: [
						"s3:PutObject",
						"s3:GetObject",
						"s3:DeleteObject",
						"s3:ListBucket",
					],
					Resource: [bucketArn, `${bucketArn}/*`],
				},
			],
		}),
	),
});

// Access key for the IAM user
const accessKey = new aws.iam.AccessKey("image-uploader-key", {
	user: imageUploader.name,
});

// Exports
export const bucketName = bucket.id;
export const bucketArn = bucket.arn;
export const cdnDomain = distribution.domainName;
export const cdnUrl = pulumi.interpolate`https://${distribution.domainName}`;
export const awsAccessKeyId = accessKey.id;
export const awsSecretAccessKey = accessKey.secret;
export const region = aws.config.region;
