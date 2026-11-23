import 'reflect-metadata';
import { existsSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { MONITOR_ADDRESSES_PATH } from '@wrible/contracts';
import { Board } from './board';
import { BoardGateway } from './board.gateway';
import { isLocalMonitorRequest, monitorAddresses } from './monitor/lan';
import { MonitorGateway } from './monitor/monitor.gateway';

@Module({ providers: [Board, BoardGateway, MonitorGateway] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  app.getHttpAdapter().get('/api/health', (_request: unknown, response: { json(body: unknown): void }) => {
    response.json({ status: 'ok' });
  });
  app.getHttpAdapter().get(MONITOR_ADDRESSES_PATH, (request: IncomingMessage, response: {
    statusCode: number;
    json(body: unknown): void;
  }) => {
    if (!isLocalMonitorRequest(request.headers.host, request.socket.remoteAddress)) {
      response.statusCode = 403;
      response.json({ error: 'Monitor disponível apenas na rede local' });
      return;
    }
    response.json(monitorAddresses());
  });

  const web = resolve(__dirname, '../../web/dist');
  if (existsSync(resolve(web, 'index.html'))) app.useStaticAssets(web);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
