import { z } from 'zod';

export const listVendorsQuery = z.object({
  organizationId: z.string().optional(),
  search: z.string().trim().optional(),
});

export type ListVendorsFilters = z.infer<typeof listVendorsQuery>;
