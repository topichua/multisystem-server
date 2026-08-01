import { VariantCustomFieldType } from "../database/entities/variant-custom-field-type.enum";

/**
 * System-proposed characteristic templates for «Додати поле з шаблону».
 * Install via POST /workspace/variant-custom-fields/library/install `{ key }`.
 *
 * UI shape:
 * - `featured` — top-level fields (e.g. Колір)
 * - `groups` — collapsible categories with icon + fieldCount
 * The same field `key` may appear in featured and/or several groups (one install).
 */

export type SystemFieldLibraryEntry = {
  /** Stable install key (= workspace field `key` after install). */
  key: string;
  /**
   * Short UI name stored as workspace `displayName`
   * (e.g. `Розмір` — shown inside category without tautology).
   */
  label: string;
  type: VariantCustomFieldType;
  /** Suggested initial options when type is `options`. */
  options: string[];
  description?: string;
  sortOrder: number;
};

export type SystemFieldLibraryGroupDef = {
  key: string;
  label: string;
  /** Frontend icon id (shirt, shoe, bag, sofa, phone, car, …). */
  icon: string;
  sortOrder: number;
  /** Field keys from SYSTEM_FIELD_LIBRARY_BY_KEY (order preserved). */
  fieldKeys: string[];
};

const COLOR_OPTIONS = [
  "Чорний",
  "Білий",
  "Червоний",
  "Синій",
  "Зелений",
  "Бежевий",
  "Сірий",
  "Коричневий",
];

const CLOTHING_SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"];

const SHOE_SIZE_OPTIONS = [
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
];

/** Unique field definitions (install by `key`). */
export const SYSTEM_FIELD_LIBRARY_BY_KEY: Record<
  string,
  SystemFieldLibraryEntry
> = {
  color: {
    key: "color",
    label: "Колір",
    type: VariantCustomFieldType.options,
    options: COLOR_OPTIONS,
    description: "Базова характеристика кольору",
    sortOrder: 0,
  },
  clothing_size: {
    key: "clothing_size",
    label: "Розмір",
    type: VariantCustomFieldType.options,
    options: CLOTHING_SIZE_OPTIONS,
    description: "Розмір одягу",
    sortOrder: 1,
  },
  clothing_material: {
    key: "clothing_material",
    label: "Матеріал",
    type: VariantCustomFieldType.text,
    options: [],
    description: "Тканина / матеріал одягу",
    sortOrder: 2,
  },
  clothing_season: {
    key: "clothing_season",
    label: "Сезон",
    type: VariantCustomFieldType.options,
    options: ["Літо", "Зима", "Демісезон", "Всесезонний"],
    sortOrder: 3,
  },
  shoe_size: {
    key: "shoe_size",
    label: "Розмір",
    type: VariantCustomFieldType.options,
    options: SHOE_SIZE_OPTIONS,
    sortOrder: 1,
  },
  shoe_upper_material: {
    key: "shoe_upper_material",
    label: "Матеріал верху",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 2,
  },
  bag_size: {
    key: "bag_size",
    label: "Розмір",
    type: VariantCustomFieldType.options,
    options: ["Mini", "Small", "Medium", "Large"],
    sortOrder: 1,
  },
  bag_material: {
    key: "bag_material",
    label: "Матеріал",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 2,
  },
  furniture_material: {
    key: "furniture_material",
    label: "Матеріал",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 1,
  },
  furniture_dimensions: {
    key: "furniture_dimensions",
    label: "Габарити",
    type: VariantCustomFieldType.text,
    options: [],
    description: "Наприклад 120×80×45 см",
    sortOrder: 2,
  },
  electronics_storage: {
    key: "electronics_storage",
    label: "Памʼять",
    type: VariantCustomFieldType.options,
    options: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"],
    sortOrder: 1,
  },
  electronics_condition: {
    key: "electronics_condition",
    label: "Стан",
    type: VariantCustomFieldType.options,
    options: ["Новий", "Як новий", "Вживаний"],
    sortOrder: 2,
  },
  auto_compatibility: {
    key: "auto_compatibility",
    label: "Сумісність",
    type: VariantCustomFieldType.text,
    options: [],
    description: "Марка / модель авто",
    sortOrder: 1,
  },
  auto_part_number: {
    key: "auto_part_number",
    label: "Артикул OEM",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 2,
  },
  jewelry_color: {
    key: "jewelry_color",
    label: "Колір",
    type: VariantCustomFieldType.options,
    options: [
      "Золотий",
      "Сріблястий",
      "Чорний",
      "Білий",
      "Рожеве золото",
    ],
    sortOrder: 0,
  },
  jewelry_material: {
    key: "jewelry_material",
    label: "Матеріал",
    type: VariantCustomFieldType.options,
    options: [
      "Нержавіюча сталь",
      "Срібло",
      "Медична сталь",
      "Біжутерний сплав",
      "Шкіра",
      "Текстиль",
      "Перлини",
    ],
    sortOrder: 1,
  },
  jewelry_type: {
    key: "jewelry_type",
    label: "Тип",
    type: VariantCustomFieldType.options,
    options: [
      "Каблучка",
      "Сережки",
      "Кулон",
      "Ланцюжок",
      "Браслет",
      "Намисто",
      "Брошка",
    ],
    sortOrder: 2,
  },
  jewelry_gender: {
    key: "jewelry_gender",
    label: "Стать",
    type: VariantCustomFieldType.options,
    options: ["Жіноча", "Чоловіча", "Унісекс"],
    sortOrder: 3,
  },
  jewelry_size: {
    key: "jewelry_size",
    label: "Розмір",
    type: VariantCustomFieldType.options,
    options: ["15", "16", "17", "18", "19", "20", "21", "One Size"],
    sortOrder: 4,
  },
  jewelry_brand: {
    key: "jewelry_brand",
    label: "Бренд",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 5,
  },
  food_type: {
    key: "food_type",
    label: "Тип",
    type: VariantCustomFieldType.options,
    options: [
      "Солодощі",
      "Мед",
      "Чай",
      "Кава",
      "Горіхи",
      "Спеції",
      "Соуси",
      "Напої",
    ],
    sortOrder: 0,
  },
  food_weight: {
    key: "food_weight",
    label: "Вага",
    type: VariantCustomFieldType.options,
    options: ["100 г", "250 г", "500 г", "1 кг"],
    sortOrder: 1,
  },
  food_taste: {
    key: "food_taste",
    label: "Смак",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 2,
  },
  food_expiry: {
    key: "food_expiry",
    label: "Термін придатності",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 3,
  },
  food_brand: {
    key: "food_brand",
    label: "Бренд",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 4,
  },
  cosmetics_type: {
    key: "cosmetics_type",
    label: "Тип",
    type: VariantCustomFieldType.options,
    options: [
      "Крем",
      "Сироватка",
      "Шампунь",
      "Бальзам",
      "Парфуми",
      "Помада",
      "Туш",
      "Пудра",
    ],
    sortOrder: 0,
  },
  cosmetics_volume: {
    key: "cosmetics_volume",
    label: "Об'єм",
    type: VariantCustomFieldType.options,
    options: ["30 мл", "50 мл", "100 мл", "250 мл", "500 мл"],
    sortOrder: 1,
  },
  cosmetics_skin_type: {
    key: "cosmetics_skin_type",
    label: "Тип шкіри",
    type: VariantCustomFieldType.options,
    options: ["Для всіх", "Суха", "Жирна", "Комбінована", "Чутлива"],
    sortOrder: 2,
  },
  cosmetics_brand: {
    key: "cosmetics_brand",
    label: "Бренд",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 3,
  },
  cosmetics_country: {
    key: "cosmetics_country",
    label: "Країна виробник",
    type: VariantCustomFieldType.text,
    options: [],
    sortOrder: 4,
  },
};

/** Top of the picker (above category accordion) — e.g. Колір. */
export const SYSTEM_FIELD_LIBRARY_FEATURED_KEYS: string[] = ["color"];

export const SYSTEM_FIELD_LIBRARY_GROUPS: SystemFieldLibraryGroupDef[] = [
  {
    key: "clothing",
    label: "Одяг",
    icon: "clothing",
    sortOrder: 0,
    fieldKeys: ["color", "clothing_size", "clothing_material", "clothing_season"],
  },
  {
    key: "shoes",
    label: "Взуття",
    icon: "shoes",
    sortOrder: 1,
    fieldKeys: ["color", "shoe_size", "shoe_upper_material"],
  },
  {
    key: "bags",
    label: "Сумки",
    icon: "bags",
    sortOrder: 2,
    fieldKeys: ["color", "bag_size", "bag_material"],
  },
  {
    key: "furniture",
    label: "Меблі",
    icon: "furniture",
    sortOrder: 3,
    fieldKeys: ["color", "furniture_material", "furniture_dimensions"],
  },
  {
    key: "electronics",
    label: "Електроніка",
    icon: "electronics",
    sortOrder: 4,
    fieldKeys: ["color", "electronics_storage", "electronics_condition"],
  },
  {
    key: "auto",
    label: "Автотовари",
    icon: "auto",
    sortOrder: 5,
    fieldKeys: ["color", "auto_compatibility", "auto_part_number"],
  },
  {
    key: "jewelry",
    label: "Прикраси",
    icon: "jewelry",
    sortOrder: 6,
    fieldKeys: [
      "jewelry_color",
      "jewelry_material",
      "jewelry_type",
      "jewelry_gender",
      "jewelry_size",
      "jewelry_brand",
    ],
  },
  {
    key: "food",
    label: "Продукти харчування",
    icon: "food",
    sortOrder: 7,
    fieldKeys: [
      "food_type",
      "food_weight",
      "food_taste",
      "food_expiry",
      "food_brand",
    ],
  },
  {
    key: "cosmetics",
    label: "Косметика",
    icon: "cosmetics",
    sortOrder: 8,
    fieldKeys: [
      "cosmetics_type",
      "cosmetics_volume",
      "cosmetics_skin_type",
      "cosmetics_brand",
      "cosmetics_country",
    ],
  },
];

export function typeDisplayLabel(type: VariantCustomFieldType): string {
  return type === VariantCustomFieldType.options ? "список" : "текст";
}

/**
 * System field name: `{group.label}:{field.name}`
 * e.g. group «Взуття» + field «Розмір» → `Взуття:Розмір`.
 * `displayName` is stored separately as `field.name` only.
 */
export function buildSystemFieldLabel(
  groupLabel: string,
  fieldName: string,
): string {
  const group = groupLabel.trim();
  const name = fieldName.trim();
  if (!name) return group;
  if (!group) return name;
  return `${group}:${name}`;
}

export function listSystemFieldLibraryFlat(): SystemFieldLibraryEntry[] {
  return Object.values(SYSTEM_FIELD_LIBRARY_BY_KEY);
}

export function findSystemFieldLibraryEntry(
  key: string,
): SystemFieldLibraryEntry | undefined {
  const normalized = key.trim().toLowerCase();
  return SYSTEM_FIELD_LIBRARY_BY_KEY[normalized];
}

export function findSystemFieldLibraryGroupForKey(
  fieldKey: string,
): SystemFieldLibraryGroupDef | undefined {
  const normalized = fieldKey.trim().toLowerCase();
  if (SYSTEM_FIELD_LIBRARY_FEATURED_KEYS.includes(normalized)) {
    return undefined;
  }
  return SYSTEM_FIELD_LIBRARY_GROUPS.find((g) =>
    g.fieldKeys.includes(normalized),
  );
}

export function resolveLibraryEntries(
  keys: string[],
): SystemFieldLibraryEntry[] {
  const out: SystemFieldLibraryEntry[] = [];
  for (const key of keys) {
    const entry = SYSTEM_FIELD_LIBRARY_BY_KEY[key];
    if (entry) out.push(entry);
  }
  return out;
}
