import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { News } from './entities/news.entity';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    @InjectRepository(News)
    private newsRepository: Repository<News>,
  ) {}

  @Cron('*/1 * * * *')
  async checkNews() {
    try {
      const response = await axios.get('https://nerehta-adm.ru/news');
      const $ = cheerio.load(response.data);

      const newsItems = $('.list-item')
        .map((_, element) => {
          const linkElement = $(element).find('.caption a.item');
          const link = linkElement.attr('href');
          const title = linkElement.text().replace(/\s+/g, ' ').trim();
          const dateStr = $(element).find('.date').text().trim();

          if (!link) {
            return null;
          }

          const external_id = parseInt(link.split('/').pop() || '0');

          return {
            external_id,
            title,
            link,
            date: new Date(dateStr),
          };
        })
        .get()
        .filter((item) => item !== null);

      for (const item of newsItems) {
        const exists = await this.newsRepository.findOne({
          where: { external_id: item.external_id },
        });

        if (!exists && item.link) {
          const newsContent = await this.getNewsContent(item.link);
          const news = await this.newsRepository.save({
            ...item,
            content: newsContent,
          });
        }
      }
    } catch (error) {
      this.logger.error('Ошибка при парсинге новостей:', error);
    }
  }

  private async getNewsContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      const description = $('.description');
      let content = '';

      const textContainers = description.find(
        'p, .wall_text, .vkitShowMoreText__text--ULCyL',
      );

      textContainers.each((_, element) => {
        let html = $(element).html() || '';

        let text = html
          .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '\n\n')
          .replace(/<br\s*\/?>/g, ' ')
          .replace(/<div[^>]*>&nbsp;<\/div>/g, '\n')
          .replace(/<[^>]*>/g, '')
          .trim();

        if (text && text !== '&nbsp;') {
          text = text
            .replace(/\s+/g, ' ')
            .replace(/(?<=[.!])\s+(?=[А-ЯA-Z])/g, '\n\n')
            .replace(/^\s*[-—]\s*/gm, '• ')
            .trim();

          if (text) {
            content += text + '\n\n';
          }
        }
      });

      const uniqueLines = [
        ...new Set(
          content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        ),
      ].join('\n\n');

      return uniqueLines;
    } catch (error) {
      this.logger.error(
        `Ошибка при получении содержания новости: ${url}`,
        error,
      );
      return '';
    }
  }
}
