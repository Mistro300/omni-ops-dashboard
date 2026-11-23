import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  public readonly bucket: string;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'http://localhost:9000';
    const region = process.env.MINIO_REGION ?? 'us-east-1';
    const accessKeyId = process.env.MINIO_ROOT_USER ?? 'omniops_minio';
    const secretAccessKey = process.env.MINIO_ROOT_PASSWORD ?? 'omniops_minio_dev_password';
    this.bucket = process.env.MINIO_BUCKET_EXPORTS ?? 'omniops-exports';

    this.s3 = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created private MinIO bucket "${this.bucket}"`);
      } catch (err) {
        this.logger.warn(
          `MinIO bucket check skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async uploadBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObjectStream(key: string): Promise<{ stream: Readable; contentType: string }> {
    const res = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!res.Body) {
      throw new Error(`Empty object body for key ${key}`);
    }

    const stream =
      res.Body instanceof Readable
        ? res.Body
        : Readable.from(res.Body as AsyncIterable<Uint8Array>);

    return {
      stream,
      contentType: res.ContentType ?? 'application/octet-stream',
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
