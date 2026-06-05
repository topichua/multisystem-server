import type { WorkspaceCategoryPromptRow } from "../instagram-category-prompt.util";

export const INSTAGRAM_POST_AI_EXTRACTION_SYSTEM_PROMPT = [
  "Ти AI-асистент для витягування даних товару з Instagram поста.",
  "Проаналізуй media, caption і список категорій.",
  "Поверни тільки валідний JSON без markdown.",
  "",
  "Задача: витягнути фактичну інформацію про товар (універсально для будь-якого типу товару).",
  "Не обмежуйся фіксованим списком характеристик (колір, розмір тощо).",
  "Не вигадуй факти.",
  "",
  "Поверни:",
  "- productName — коротка назва українською",
  "- productDescription — короткий опис українською (лише з media/caption)",
  "- price — number якщо ціна явно вказана; інакше null",
  "- brandLabel — бренд якщо явно видно/написано; інакше null",
  "- matchedCategoryIds — до 5 categoryId з каталогу categories, найкращий першим; інакше []",
  "- selectedMediaIds — mediaId де товар видно найкраще; без банерів/відгуків/текстових слайдів",
  "- attributes — [{ name, values[] }] будь-які реально визначені характеристики українською",
  "",
  "Діапазони: якщо значення однозначно розгортається (40-45, S-L, XS-XL) — поверни окремі values; інакше залиш як є.",
  "Розміри/числа: не додавай values, яких немає в пості (напр. 55, якщо в caption лише 40-45).",
].join("\n");

const JSON_SCHEMA = [
  "{",
  '  "productName": string,',
  '  "productDescription": string,',
  '  "price": number | null,',
  '  "brandLabel": string | null,',
  '  "matchedCategoryIds": string[],',
  '  "selectedMediaIds": string[],',
  '  "attributes": [{ "name": string, "values": string[] }]',
  "}",
].join("\n");

export type PostMediaPromptRow = {
  mediaId: string;
  type: "image" | "video";
};

export function buildInstagramPostAiExtractionUserText(params: {
  instagramPostId: string;
  caption: string | null;
  mediaType: string | null;
  permalink: string | null;
  categories: WorkspaceCategoryPromptRow[];
  media: PostMediaPromptRow[];
}): string {
  return [
    "Витягни інформацію про товар з Instagram поста.",
    "",
    `instagramPostId: ${params.instagramPostId}`,
    `Тип медіа: ${params.mediaType ?? "невідомо"}`,
    `Посилання: ${params.permalink ?? "немає"}`,
    "",
    "Caption:",
    params.caption?.trim() || "(відсутній)",
    "",
    "Media (mediaId, type):",
    JSON.stringify(params.media, null, 2),
    "",
    "Categories:",
    JSON.stringify(params.categories, null, 2),
    "",
    "JSON:",
    JSON_SCHEMA,
  ].join("\n");
}
