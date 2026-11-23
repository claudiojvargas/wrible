import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { Board } from './board';
import { BoardGateway } from './board.gateway';

@Module({ providers: [Board, BoardGateway] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  app.getHttpAdapter().get('/api/health', (_request: unknown, response: { json(body: unknown): void }) => {
    response.json({ status: 'ok' });
  });

  const web = resolve(__dirname, '../../web/dist');
  if (existsSync(resolve(web, 'index.html'))) app.useStaticAssets(web);
  await app.listen(3000, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
