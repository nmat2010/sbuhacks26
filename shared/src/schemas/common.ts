import { z } from 'zod';

// Device names match the DB CHECK constraints (sessions.device, nudges.device, ...).
export const Device = z.enum(['desktop', 'webapp']);

export type DeviceType = z.infer<typeof Device>;
