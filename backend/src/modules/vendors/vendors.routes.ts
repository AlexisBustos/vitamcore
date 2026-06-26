import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { getVendorController, listVendorsController } from './vendors.controller';

export const vendorsRouter = Router();

vendorsRouter.get('/', asyncHandler(listVendorsController));
vendorsRouter.get('/:id', asyncHandler(getVendorController));
