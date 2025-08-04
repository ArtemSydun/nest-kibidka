import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('scrape')
  async manualScrape(): Promise<string> {
    await this.appService.scrape();
    return '🚀 Manual scrape triggered';
  }
}
