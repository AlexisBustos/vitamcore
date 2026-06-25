import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { getClientController, listClientsController } from './clients.controller';

export const clientsRouter = Router();

clientsRouter.get('/', asyncHandler(listClientsController));
clientsRouter.get('/:id', asyncHandler(getClientController));
