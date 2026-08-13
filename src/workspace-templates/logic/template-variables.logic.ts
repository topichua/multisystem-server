import { WorkspaceTemplateType } from "../workspace-template-type.enum";

export type TemplateVariableDefinition = {
  /** Dot key used in `{placeholder}` and for client-side localization. */
  key: string;
  /** Exact token written in template text, e.g. `{client.name}`. */
  placeholder: string;
};

const CHAT_VARIABLES: TemplateVariableDefinition[] = [
  { key: "client.name", placeholder: "{client.name}" },
  { key: "client.lastName", placeholder: "{client.lastName}" },
  { key: "client.phoneNumber", placeholder: "{client.phoneNumber}" },
];

const ORDER_VARIABLES: TemplateVariableDefinition[] = [
  { key: "client.name", placeholder: "{client.name}" },
  { key: "client.lastName", placeholder: "{client.lastName}" },
  { key: "client.phone", placeholder: "{client.phone}" },
  { key: "order.status", placeholder: "{order.status}" },
  { key: "order.ttn", placeholder: "{order.ttn}" },
  { key: "order.delivery_status", placeholder: "{order.delivery_status}" },
  { key: "order.payment_status", placeholder: "{order.payment_status}" },
];

export function getTemplateVariablesForType(
  type: WorkspaceTemplateType,
): TemplateVariableDefinition[] {
  return type === WorkspaceTemplateType.chat
    ? [...CHAT_VARIABLES]
    : [...ORDER_VARIABLES];
}

export function listTemplateVariableCatalog(): Array<{
  type: WorkspaceTemplateType;
  variables: TemplateVariableDefinition[];
}> {
  return [
    {
      type: WorkspaceTemplateType.chat,
      variables: getTemplateVariablesForType(WorkspaceTemplateType.chat),
    },
    {
      type: WorkspaceTemplateType.order,
      variables: getTemplateVariablesForType(WorkspaceTemplateType.order),
    },
  ];
}

/** Replace `{key}` placeholders using a flat key→value map. Missing → empty string. */
export function renderTemplateText(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? "";
    }
    return match;
  });
}
