import dotenv from "dotenv";

dotenv.config();

export const config = {
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    region: process.env.AWS_REGION || "us-east-1",
    bucketName: process.env.AWS_S3_BUCKET_NAME || "",
    endpoint: process.env.AWS_S3_ENDPOINT_URL,
  },
  server: {
    port: parseInt(process.env.PORT || "4000", 10),
    // corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "5368709120", 10), // 5GB default
    chunkSize: parseInt(process.env.CHUNK_SIZE || "104857600", 10), // 100MB default
    presignedUrlExpiry: 3600, // 1 hour
  },
};

export const validateConfig = (): void => {
  const required = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET_NAME",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
};
