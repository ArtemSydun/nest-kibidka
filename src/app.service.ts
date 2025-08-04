import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Redis } from '@upstash/redis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly redis: Redis;

  private readonly regularUrl: string;
  private readonly taxFreeUrl: string;
  private readonly telegramBotToken: string;
  private readonly telegramChatId: string;

  constructor(private configService: ConfigService) {
    this.regularUrl = this.configService.getOrThrow<string>('REGULAR_URL');
    this.taxFreeUrl = this.configService.getOrThrow<string>('TAXFREE_URL');
    this.telegramBotToken =
      this.configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    this.telegramChatId =
      this.configService.getOrThrow<string>('TELEGRAM_CHAT_ID');

    this.redis = new Redis({
      url: this.configService.getOrThrow<string>('UPSTASH_REDIS_REST_URL'),
      token: this.configService.getOrThrow<string>('UPSTASH_REDIS_REST_TOKEN'),
    });
  }

  @Cron('*/5 * * * *')
  async handleCron() {
    this.logger.log('⏰ Running cron scrape...');
    await this.scrape();
  }

  public async scrape() {
    try {
      await this.scrapeQuotes(this.regularUrl, 'seen_regular');
      await this.scrapeQuotes(
        this.taxFreeUrl,
        'seen_taxfree',
        '‼️ БЕЗ КОМІСІЇ ‼️\n',
      );
      this.logger.log('✅ Scraping complete');
    } catch (error) {
      this.logger.error('❌ Scraping failed', error);
    }
  }

  private async sendTelegramMessage(text: string) {
    const telegramUrl = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: this.telegramChatId, text }),
    });
  }

  private async scrapeQuotes(url: string, redisKey: string, tag = '') {
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);
    const newQuotes: any[] = [];

    $('div[data-testid="listing-grid"] div[data-cy="l-card"]').each((_, el) => {
      const title = $(el).find('h4').text();
      const price = $(el).find('p[data-testid="ad-price"]').text();
      const href = $(el).find('a').attr('href');
      const date = $(el).find('p[data-testid="location-date"]').text();
      const fullUrl = 'https://www.olx.ua' + href;

      newQuotes.push({ title, price, date, url: fullUrl });
    });

    for (const quote of newQuotes) {
      const alreadySeen = await this.redis.sismember(redisKey, quote.url);
      if (!alreadySeen) {
        await this.redis.sadd(redisKey, quote.url);
        const msg = `${tag}${quote.title}\n${quote.price}\n${quote.date}\n${quote.url}`;
        await this.sendTelegramMessage(msg);
      }
    }
  }

  public getHello(): string {
    return '✅ NestJS scraper is running';
  }
}
