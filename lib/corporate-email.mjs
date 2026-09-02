export const ALLOWED_GOOGLE_DOMAIN = "quartavia.com.br";

export const INVALID_DOMAIN_MESSAGE =
  "O acesso é permitido somente para contas @quartavia.com.br.";

export function isAllowedCorporateEmail(email) {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split("@");
  return parts.length === 2 && parts[0].length > 0 && parts[1] === ALLOWED_GOOGLE_DOMAIN;
}
