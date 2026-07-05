import { Module } from "@nestjs/common";
import { CloudflareR2Service } from "./cloudflare-r2.service";
import { StorageController } from "./storage.controller";
import { StorageService } from "./storage.service";

@Module({
  controllers: [StorageController],
  providers: [CloudflareR2Service, StorageService],
  exports: [CloudflareR2Service, StorageService],
})
export class StorageModule {}
