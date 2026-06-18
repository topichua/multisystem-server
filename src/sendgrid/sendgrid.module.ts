import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SendgridController } from "./sendgrid.controller";
import { SendgridService } from "./sendgrid.service";

@Module({
  imports: [ConfigModule],
  controllers: [SendgridController],
  providers: [SendgridService],
  exports: [SendgridService],
})
export class SendgridModule {}
