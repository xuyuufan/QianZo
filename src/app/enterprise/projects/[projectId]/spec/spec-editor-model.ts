import type { SpecDocumentV1 } from "@/modules/specs/document";

export type EditableSpecCollection =
  | "userRoles"
  | "features"
  | "pages"
  | "userFlows"
  | "integrations"
  | "deliverables"
  | "milestones";

export function createStableSpecId(prefix: string, randomId = crypto.randomUUID()): string {
  const normalizedPrefix = prefix
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 26) || "item";
  return `${normalizedPrefix}-${randomId}`;
}

export function moveSpecItem<T>(items: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const moved = [...items];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

export function specReferenceBlockers(
  document: SpecDocumentV1,
  collection: EditableSpecCollection,
  id: string,
): string[] {
  if (collection === "userRoles") {
    return document.features.filter((feature) => feature.userRoleIds.includes(id)).map((feature) => feature.id);
  }
  if (collection === "features") {
    return document.pages.filter((page) => page.featureIds.includes(id)).map((page) => page.id);
  }
  if (collection === "deliverables") {
    return document.milestones.filter((milestone) => milestone.deliverableIds.includes(id)).map((milestone) => milestone.id);
  }
  return [];
}
