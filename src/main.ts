import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Apply unified HTTP pipeline (Helmet, 100kb body limit, CORS, Pipes, Filters)
  configureApp(app);

  // Enable Graceful Shutdown hooks for containerized orchestrators
  app.enableShutdownHooks();

  // Swagger Documentation (Strictly gated to non-production environments)
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ummah Backend API')
      .setDescription('Ummah Social Media Platform V1 API Specification')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(
    `🚀 Ummah API running on port ${port} (Swagger docs: ${!isProduction ? '/docs' : 'DISABLED'})`,
  );
}

bootstrap();
