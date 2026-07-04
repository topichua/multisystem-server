import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { ConversationGroupDefaultsModule } from "../conversations/conversation-group-defaults.module";
import { OrderStatusDefaultsModule } from "../orders/order-status-defaults.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [UsersModule, ConversationGroupDefaultsModule, OrderStatusDefaultsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
