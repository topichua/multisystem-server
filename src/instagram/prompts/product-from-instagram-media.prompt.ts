/**
 * Промпти для визначення даних товару з Instagram (фото/прев’ю + підпис).
 * Редагуй цей файл, щоб змінити тон або правила.
 */

/** Системне повідомлення: роль і обмеження моделі. */
export const PRODUCT_FROM_INSTAGRAM_SYSTEM_PROMPT = [
  "Ти асистент каталогу товарів. Отримуєш Instagram пост (фото + опційно caption).",
  "",
  "Завдання: визначити товар і заповнити поля product.",
  "",
  "- colors: тільки видимі або явно вказані кольори; якщо не впевнений — [] або лише очевидні",
  "- sizes: тільки якщо є в caption або видно на фото; інакше []",
  "- всі текстові значення українською",
  "- не вигадуй характеристики; якщо невідомо — вкажи невизначеність",
  "",
  "Вихід: один JSON-об’єкт за заданою схемою, без зайвого тексту",
].join("\n");

/**
 * Опис JSON для режиму json_object.
 * Синхронізуй з парсингом у `instagram-product-ai.service.ts`.
 */
export const PRODUCT_FROM_INSTAGRAM_JSON_SCHEMA_DESCRIPTION = [
  "{",
  '  "product": {',
  '    "name": string,',
  '    "shortDescription": string,',
  '    "colors": string[],',
  '    "sizes": string[],',
  '    "visiblePriceOrOffer": string | null,',
  '    "brandOrLabel": string | null',
  "  },",
  '  "category": {',
  '    "matchedCategoryId": number | null,',
  '    "matchedCategoryPath": string | null,',
  '    "reason": string',
  "  }",
  "}",
].join("\n");

export function buildProductFromInstagramUserText(params: {
  caption: string | null;
  mediaType: string | null;
  permalink: string | null;
  instagramMediaId: string;
  categoryCatalogLines: string;
}): string {
  const captionBlock = params.caption?.trim() || "(підпис відсутній)";
  const catalogBlock =
    params.categoryCatalogLines.trim() ||
    "(категорії в робочому просторі не налаштовані — постав matchedCategoryId: null і поясни в category.reason)";

  return [
    "Проаналізуй цей пост Instagram для картки товару в каталозі.",
    "Опирайся на зображення та на підпис разом: спочатку подивись, що видно на фото, потім уточни з caption і хештегів.",
    "",
    `Ідентифікатор медіа Instagram: ${params.instagramMediaId}`,
    `Тип медіа (з API): ${params.mediaType ?? "невідомо"}`,
    `Посилання: ${params.permalink ?? "немає"}`,
    "",
    "Підпис (caption):",
    captionBlock,
    "",
    "Категорії товарів у робочому просторі (обери не більше одного matchedCategoryId зі списку, або null):",
    catalogBlock,
    "",
    "Поверни JSON точно у такій структурі (усі ключі обов’язкові; де вказано null — став null):",
    PRODUCT_FROM_INSTAGRAM_JSON_SCHEMA_DESCRIPTION,
    "",
    "Правила для category:",
    "- matchedCategoryId — одне з числових id зі списку вище, або null.",
    '- matchedCategoryPath — шлях як у списку (наприклад "Одяг > Джинси") або твій найкращий підпис українською, якщо null.',
    "- reason — одне коротке речення українською: чому підходить категорія або чому обрано null.",
    "",
    "Нагадування: `colors` та `sizes` — саме масиви рядків; не клади кольори чи розміри в `attributes`, якщо вони вже в цих масивах.",
  ].join("\n");
}
