import type { Request, Response } from 'express';
import * as service from './categories.service';
import { reapplyRules } from './category-rules.service';
import {
  createCategorySchema,
  listCategoriesQuery,
  updateCategorySchema,
} from './categories.schema';

export async function listCategoriesController(req: Request, res: Response) {
  const { includeInactive } = listCategoriesQuery.parse(req.query);
  res.json({ data: await service.listCategories(includeInactive) });
}

export async function createCategoryController(req: Request, res: Response) {
  const input = createCategorySchema.parse(req.body);
  res.json({ data: await service.createCategory(input) });
}

export async function updateCategoryController(req: Request, res: Response) {
  const input = updateCategorySchema.parse(req.body);
  res.json({ data: await service.updateCategory(req.params.key, input) });
}

export async function deleteCategoryController(req: Request, res: Response) {
  res.json({ data: await service.deleteCategory(req.params.key) });
}

export async function reapplyController(_req: Request, res: Response) {
  res.json({ data: await reapplyRules() });
}
