import { z } from 'zod';

export const uuid = z.uuid();
const serviceIds = z.array(uuid).min(1).max(8).refine(values => new Set(values).size === values.length).transform(values => [...values].sort());
const barberId = uuid.nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
});
const instant = z.iso.datetime({offset:true}).transform(value => new Date(value).toISOString());
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const phone = z.string().max(40).transform(value => {
  const clean=value.trim().replace(/[\s()-]/g,'');
  return clean.startsWith('0') ? `+66${clean.slice(1)}` : clean.startsWith('66') ? `+${clean}` : clean;
}).pipe(z.string().regex(/^\+66(?:[689]\d{8}|[2-57]\d{7})$/));
export const availabilitySchema = z.object({serviceIds,barberId,date}).strict();
export const createBookingSchema = z.object({
  serviceIds,barberId,startsAt:instant,
  customer:z.object({name:z.string().trim().min(1).max(100),phone,locale:z.enum(['th','en']),marketingOptIn:z.boolean()}).strict(),
  note:z.string().trim().max(1000).default(''),
  turnstileToken:z.string().min(1).max(2048),idempotencyKey:uuid,manageToken:token,
}).strict();
const manageBase={bookingId:uuid,token};
export const manageSchema=z.discriminatedUnion('action',[
  z.object({...manageBase,action:z.literal('availability'),date,barberId}).strict(),
  z.object({...manageBase,action:z.literal('read')}).strict(),
  z.object({...manageBase,action:z.literal('cancel'),expectedRevision:z.number().int().positive(),reason:z.string().trim().max(500).optional()}).strict(),
  z.object({...manageBase,action:z.literal('reschedule'),expectedRevision:z.number().int().positive(),startsAt:instant,barberId}).strict(),
]);
