import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';

@Injectable()
export class ZodValidationPipe<T = unknown> implements PipeTransform {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        });
        throw new BadRequestException({
          message: messages,
          error: 'Validation Error',
        });
      }
      throw new BadRequestException('Invalid request payload');
    }
  }
}
