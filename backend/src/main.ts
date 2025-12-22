import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: 'http://localhost:3001', // Frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });

  // Swagger setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Larkx.ai API')
    .setDescription('Last-mile publishing API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/docs', app, swaggerDocument);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
