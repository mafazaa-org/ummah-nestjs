import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`🚀 Ummah API is running on: http://localhost:${port}`);
}

bootstrap();
