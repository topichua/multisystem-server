import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AppService } from "./app.service";
@ApiTags("app")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: "Health / hello" })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("health")
  @ApiOperation({ summary: "Health check (JSON)" })
  health(): { ok: true; service: string } {
    return { ok: true, service: "multisystem-server" };
  }
}
