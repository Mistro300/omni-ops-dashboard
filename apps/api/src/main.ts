import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadApiEnvFiles } from './config/load-env';
import { validateEnv } from './config/env.schema';

async function bootstrap() {
  loadApiEnvFiles();
  const env = validateEnv();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(env.API_PREFIX);
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Export-Mode', 'X-Export-Row-Count'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OmniOps API')
    .setDescription('Multi-Warehouse Inventory & Order Operations Admin API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${env.API_PREFIX}/docs`, app, document);

  await app.listen(env.API_PORT);
  // eslint-disable-next-line no-console
  console.log(`OmniOps API running on http://localhost:${env.API_PORT}/${env.API_PREFIX}`);
}

bootstrap();
