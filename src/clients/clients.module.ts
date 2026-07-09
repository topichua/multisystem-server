import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  ClientLink,
  ClientWishlistItem,
  InstagramUser,
  Product,
  ProductVariant,
  TelegramUser,
} from "../database/entities";
import { OrdersModule } from "../orders/orders.module";
import { ProductsModule } from "../products/products.module";
import { ClientsController } from "./clients.controller";
import { ClientLinksController } from "./client-links.controller";
import { ClientWishlistController } from "./client-wishlist.controller";
import { ClientsService } from "./clients.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      ClientLink,
      ClientWishlistItem,
      Product,
      ProductVariant,
      InstagramUser,
      TelegramUser,
    ]),
    OrdersModule,
    ProductsModule,
  ],
  controllers: [
    ClientWishlistController,
    ClientLinksController,
    ClientsController,
  ],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
