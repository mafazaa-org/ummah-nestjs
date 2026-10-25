import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

async function exportSwagger() {
  console.log('Generating OpenAPI Swagger specification JSON...');
  const app = await NestFactory.create(AppModule, { logger: false });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ummah Backend API')
    .setDescription('Ummah Social Media Platform V1 API Specification')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const outputPath = path.resolve(__dirname, '../docs/openapi-spec.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

  console.log(`✅ OpenAPI spec exported successfully to: ${outputPath}`);
  await app.close();
  process.exit(0);
}

exportSwagger().catch((err) => {
  console.error('❌ Failed to export Swagger spec:', err);
  process.exit(1);
});
