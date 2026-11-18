import { encodeJson, LarkxError } from "@larkx/core";
import type { JsonValue } from "@larkx/protocol";

export interface JsonSchema {
  readonly type: "object" | "string" | "number" | "integer" | "boolean" | "array" | "null";
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: JsonSchema;
  readonly enum?: readonly JsonValue[];
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function validateJsonSchema(schema: JsonSchema, value: JsonValue): string | null {
  const error = validate(schema, value, "$");
  return error === null ? null : error.slice(0, 300);
}

function validate(schema: JsonSchema, value: JsonValue, path: string): string | null {
  if (schema.enum !== undefined && !schema.enum.some((candidate) => sameJson(candidate, value))) {
    return `${path} is not an allowed value.`;
  }
  switch (schema.type) {
    case "null":
      return value === null ? null : `${path} must be null.`;
    case "string":
      return typeof value === "string" ? null : `${path} must be a string.`;
    case "boolean":
      return typeof value === "boolean" ? null : `${path} must be a boolean.`;
    case "number":
      return typeof value === "number" ? null : `${path} must be a number.`;
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
        ? null
        : `${path} must be an integer.`;
    case "array":
      if (!Array.isArray(value)) {
        return `${path} must be an array.`;
      }
      if (schema.items === undefined) {
        return `${path} is missing an item schema.`;
      }
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (item === undefined) {
          return `${path}[${String(index)}] is missing.`;
        }
        const itemError = validate(schema.items, item, `${path}[${String(index)}]`);
        if (itemError) {
          return itemError;
        }
      }
      return null;
    case "object":
      return validateObject(schema, value, path);
    default:
      return `${path} has an unsupported schema.`;
  }
}

function validateObject(schema: JsonSchema, value: JsonValue, path: string): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return `${path} must be an object.`;
  }
  const properties = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (value[key] === undefined) {
      return `${path}.${key} is required.`;
    }
  }
  const allowAdditional = schema.additionalProperties === true;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return `${path}.${key} is not allowed.`;
    }
    const property = properties[key];
    const propertyValue = value[key];
    if (propertyValue === undefined) {
      return `${path}.${key} is missing.`;
    }
    if (property === undefined) {
      if (!allowAdditional) {
        return `${path}.${key} is not a property of this tool.`;
      }
      continue;
    }
    const propertyError = validate(property, propertyValue, `${path}.${key}`);
    if (propertyError) {
      return propertyError;
    }
  }
  return null;
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  try {
    return encodeJson(left) === encodeJson(right);
  } catch (error) {
    if (error instanceof LarkxError) {
      return false;
    }
    throw error;
  }
}
