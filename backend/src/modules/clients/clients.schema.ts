import { z } from 'zod';

export const listClientsQuery = z.object({
  organizationId: z.string().optional(),
  search: z.string().trim().optional(),
});

export type ListClientsFilters = z.infer<typeof listClientsQuery>;
