import type { CategoryTreeNodeDto } from "../categories/categories.service";

export type WorkspaceCategoryPromptRow = {
  categoryId: string;
  categoryName: string;
  parent: { categoryId: string; categoryName: string } | null;
};

export function collectCategoryIds(nodes: CategoryTreeNodeDto[]): Set<string> {
  const ids = new Set<string>();
  const walk = (n: CategoryTreeNodeDto) => {
    ids.add(String(n.id));
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

export function flattenCategoriesForPrompt(
  nodes: CategoryTreeNodeDto[],
): WorkspaceCategoryPromptRow[] {
  const out: WorkspaceCategoryPromptRow[] = [];
  for (const root of nodes) {
    out.push({
      categoryId: String(root.id),
      categoryName: root.name,
      parent: null,
    });
    for (const child of root.children ?? []) {
      out.push({
        categoryId: String(child.id),
        categoryName: child.name,
        parent: {
          categoryId: String(root.id),
          categoryName: root.name,
        },
      });
    }
  }
  return out;
}
