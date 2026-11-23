import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  createExtendedPrismaClient,
  ExtendedPrismaClient,
} from './prisma-soft-delete.extension';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly baseClient: PrismaClient;
  public readonly db: ExtendedPrismaClient;

  constructor() {
    this.baseClient = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    this.db = createExtendedPrismaClient(this.baseClient);
  }

  /** Access raw PrismaClient when soft-deleted records or raw transactions are needed. */
  get raw(): PrismaClient {
    return this.baseClient;
  }

  async onModuleInit(): Promise<void> {
    await this.baseClient.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.baseClient.$disconnect();
  }
}
