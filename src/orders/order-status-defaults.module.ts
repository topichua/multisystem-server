import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrderStatus } from "../database/entities";
import { OrderStatusDefaultsService } from "./order-status-defaults.service";

/** Minimal module so workspace/auth bootstrap can seed system order statuses without importing full orders stack. */
@Module({
  imports: [TypeOrmModule.forFeature([OrderStatus])],
  providers: [OrderStatusDefaultsService],
  exports: [OrderStatusDefaultsService],
})
export class OrderStatusDefaultsModule {}
