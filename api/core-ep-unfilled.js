import { handleCoreEpUnfilledApi } from "../lib/api/core-ep-unfilled-handler.mjs";

export default async function handler(req, res) {
  await handleCoreEpUnfilledApi(req, res);
}
