import type { Request, Response } from 'express';
import * as service from './category-rules.service';
import {
  createRuleSchema,
  previewRuleQuery,
  reorderRulesSchema,
  updateRuleSchema,
} from './category-rules.schema';

export async function listRulesController(_req: Request, res: Response) {
  res.json({ data: await service.listRules() });
}

export async function createRuleController(req: Request, res: Response) {
  const input = createRuleSchema.parse(req.body);
  res.json({ data: await service.createRule(input) });
}

export async function updateRuleController(req: Request, res: Response) {
  const input = updateRuleSchema.parse(req.body);
  res.json({ data: await service.updateRule(req.params.id, input) });
}

export async function deleteRuleController(req: Request, res: Response) {
  res.json({ data: await service.deleteRule(req.params.id) });
}

export async function reorderRulesController(req: Request, res: Response) {
  const { ids } = reorderRulesSchema.parse(req.body);
  res.json({ data: await service.reorderRules(ids) });
}

export async function previewRuleController(req: Request, res: Response) {
  const { matchText, direction } = previewRuleQuery.parse(req.query);
  res.json({ data: await service.previewRule(matchText, direction ?? 'ANY') });
}
