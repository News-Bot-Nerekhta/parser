import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { News } from './entities/news.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([News]),
  ]
})
export class NewsModule {}