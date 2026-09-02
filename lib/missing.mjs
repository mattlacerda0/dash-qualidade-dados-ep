export function isMissingFieldValue(value, includeBlank = false) {
  if (value == null) return true;
  if (includeBlank && typeof value === "string" && value.trim() === "") return true;
  return false;
}
