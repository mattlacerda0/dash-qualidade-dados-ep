import { handleEpUnfilledApi } from "../lib/api/ep-unfilled-handler.mjs";

export default async function handler(req, res) {
  await handleEpUnfilledApi(req, res);
}
