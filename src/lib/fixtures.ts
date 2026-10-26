/**
 * Development-only synthetic UI fixtures. Not a booking/availability implementation.
 * Every service, price, barber and busy period below is invented example data (flagged isPlaceholder);
 * none of it is shop data and none of it reaches production builds.
 */
import type { Availability, AvailabilityRequest, Barber, BookingView, Catalog, CustomerApi, ManageBookingRequest, Service, Slot } from '../types/api';
import { ApiError } from './api';

const sid = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
const bid = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;
const t = (th: string, en: string) => ({ th, en });
const EXAMPLE = t('ราคาตัวอย่าง', 'Example price');

const services: Service[] = [
  { id: sid(1), name: t('ตัดผมชาย', "Men's haircut"), description: t('ตัดทรงตามที่ต้องการ พร้อมจัดทรงเบื้องต้น', 'Classic cut with a quick finish'), priceBaht: 250, durationMinutes: 45 },
  { id: sid(2), name: t('สกินเฟด', 'Skin fade'), description: t('ไล่ระดับเนียน สะอาด คมชัด', 'Clean, sharp gradient fade'), priceBaht: 300, durationMinutes: 60 },
  { id: sid(3), name: t('ตัดผมเด็ก', "Kids' cut"), description: t('สำหรับน้อง ๆ อายุไม่เกิน 12 ปี', 'For children aged 12 and under'), priceBaht: 200, durationMinutes: 30 },
  { id: sid(4), name: t('แต่งหนวดเครา', 'Beard trim'), description: t('เล็มและจัดทรงหนวดเครา', 'Shape and tidy the beard'), priceBaht: 150, durationMinutes: 30 },
  { id: sid(5), name: t('โกนหนวดผ้าร้อน', 'Hot towel shave'), description: t('โกนด้วยมีดโกนและผ้าร้อน', 'Straight-razor shave with hot towel'), priceBaht: 200, durationMinutes: 30 },
  { id: sid(6), name: t('สระ ไดร์ จัดทรง', 'Wash, blow-dry & style'), description: t('สระผม ไดร์ และจัดทรงด้วยผลิตภัณฑ์', 'Shampoo, blow-dry and styling'), priceBaht: 150, durationMinutes: 30 },
  { id: sid(7), name: t('ทำสีผม', 'Hair colour'), description: t('ย้อมหรือเปลี่ยนสีผม (รวมเวลาพักสี)', 'Colour change, including processing time'), priceBaht: 800, durationMinutes: 90 },
].map((s) => ({ ...s, description: { th: `${s.description.th} · ${EXAMPLE.th}`, en: `${s.description.en} · ${EXAMPLE.en}` }, isPlaceholder: true, bookable: true }));

interface Shift { opens: number; closes: number; breaks: [number, number][]; offWeekdays: number[] }
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const shifts: Record<string, Shift> = {
  [bid(1)]: { opens: min('10:30'), closes: min('19:30'), breaks: [[min('13:30'), min('14:30')]], offWeekdays: [] },
  [bid(2)]: { opens: min('10:30'), closes: min('19:30'), breaks: [[min('14:00'), min('15:00')]], offWeekdays: [] },
  [bid(3)]: { opens: min('10:30'), closes: min('19:30'), breaks: [[min('13:00'), min('14:00')]], offWeekdays: [2] },
  [bid(4)]: { opens: min('12:00'), closes: min('19:30'), breaks: [[min('16:00'), min('16:30')]], offWeekdays: [] },
};

const barbers: Barber[] = [
  { id: bid(1), name: t('ช่างเอ', 'Barber A'), specialties: t('ตัดทรงคลาสสิก · โกนหนวด', 'Classic cuts · shaves'), serviceIds: [sid(1), sid(2), sid(4), sid(5), sid(6)] },
  { id: bid(2), name: t('ช่างบี', 'Barber B'), specialties: t('ผมเด็ก · ทำสีผม', "Kids' cuts · colour"), serviceIds: [sid(1), sid(3), sid(4), sid(6), sid(7)] },
  { id: bid(3), name: t('ช่างซี', 'Barber C'), specialties: t('สกินเฟด · ทำได้ครบทุกบริการหลัก', 'Skin fades · all-rounder'), serviceIds: [sid(1), sid(2), sid(3), sid(4), sid(5), sid(6)] },
  { id: bid(4), name: t('ช่างดี', 'Barber D'), specialties: t('จัดทรง · ทำสี (เข้ากะบ่าย)', 'Styling · colour (afternoon shift)'), serviceIds: [sid(1), sid(2), sid(4), sid(6), sid(7)] },
].map((b) => ({ ...b, photoUrl: null, isPlaceholder: true }));

const catalog: Catalog = {
  mode: 'fixtures',
  shop: { name: 'Hook Menclub', address: '888/88 โครงการเจ้าสัว 69 ถ.บางบอน 3, แขวงหลักสอง เขตบางแค กรุงเทพฯ 10160', phone: '099 059 2205',
    latitude: 13.6884457, longitude: 100.3824744, timezone: 'Asia/Bangkok', rating: 4.7, reviewCount: 27,
    hours: Array.from({length:7}, (_,weekday) => ({weekday,opens:'10:30',closes:'19:30',closed:false})),
    cancellationHours: 4, slotStepMinutes: 30, minimumNoticeMinutes: 60, bookingHorizonDays: 30, onlineBookingEnabled: true,
    lineUrl: null, googleReviewUrl: null, features: {walkInQueue:false,deposits:false,loyalty:false,vouchers:false,products:false,waitlist:false} },
  services, barbers, gallery: [],
};

// ---- Simulated busy periods -------------------------------------------------------------------------------------
type Busy = { start: number; end: number; bookingId?: string }; // minutes since Bangkok midnight of `date`
const created = new Map<string, Map<string, Busy[]>>(); // date -> barberId -> blocks made in this browser session

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic pseudo-bookings so each barber/day looks different but stable across reloads. */
function simulatedBusy(date: string, barberId: string): Busy[] {
  const shift = shifts[barberId];
  const blocks: Busy[] = [];
  let seed = hash(`${date}|${barberId}`);
  const next = () => { seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0; seed = Math.imul(seed ^ (seed >>> 13), 3266489909) >>> 0; return (seed ^ (seed >>> 16)) >>> 0; };
  const count = 3 + (next() % 5);
  for (let i = 0; i < count; i++) {
    const length = [30, 45, 60][next() % 3];
    const start = shift.opens + 30 * (next() % Math.max(1, Math.floor((shift.closes - shift.opens - length) / 30) + 1));
    blocks.push({ start, end: start + length });
  }
  return blocks;
}

function busyFor(date: string, barberId: string, ignoreBooking?: string): Busy[] {
  const own = (created.get(date)?.get(barberId) ?? []).filter((b) => b.bookingId !== ignoreBooking);
  return [...simulatedBusy(date, barberId), ...own];
}

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const toIso = (date: string, minutes: number) => new Date(Date.parse(`${date}T00:00:00+07:00`) + minutes * 60000).toISOString();
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

function canTake(barber: Barber, date: string, start: number, length: number, ignoreBooking?: string): boolean {
  const shift = shifts[barber.id];
  if (shift.offWeekdays.includes(weekdayOf(date))) return false;
  const end = start + length;
  if (start < shift.opens || end > shift.closes) return false;
  if (shift.breaks.some(([b0, b1]) => overlaps(start, end, b0, b1))) return false;
  if (Date.parse(`${date}T00:00:00+07:00`) + start * 60000 < Date.now() + catalog.shop.minimumNoticeMinutes * 60000) return false;
  return !busyFor(date, barber.id, ignoreBooking).some((b) => overlaps(start, end, b.start, b.end));
}

function plan(serviceIds: string[], barberId: string | null) {
  const chosen = serviceIds.map((id) => services.find((s) => s.id === id)).filter((s): s is Service => Boolean(s));
  if (!chosen.length || chosen.length !== serviceIds.length) throw new ApiError('INVALID_INPUT');
  const length = chosen.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  const pool = barbers.filter((b) => chosen.every((s) => b.serviceIds.includes(s.id)) && (barberId === null || b.id === barberId));
  return { chosen, length, pool };
}

function availability({ serviceIds, barberId, date }: AvailabilityRequest, ignoreBooking?: string): Availability {
  const { length, pool } = plan(serviceIds, barberId);
  const slots: Slot[] = [];
  for (let start = min('10:30'); start + length <= min('19:30'); start += catalog.shop.slotStepMinutes) {
    const free = pool.filter((b) => canTake(b, date, start, length, ignoreBooking));
    if (free.length) slots.push({ startsAt: toIso(date, start), endsAt: toIso(date, start + length), barberIds: free.map((b) => b.id) });
  }
  return { date, timezone: 'Asia/Bangkok', slots };
}

const bangkokDate = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10);
const minutesOfDay = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

function reserve(date: string, barberId: string, block: Busy) {
  const day = created.get(date) ?? new Map<string, Busy[]>();
  day.set(barberId, [...(day.get(barberId) ?? []), block]);
  created.set(date, day);
}
function release(bookingId: string) {
  for (const day of created.values()) for (const [id, list] of day) day.set(id, list.filter((b) => b.bookingId !== bookingId));
}

// ---- API ------------------------------------------------------------------------------------------------------------
const bookings = new Map<string,{booking:BookingView;token:string}>();
const requests = new Map<string,{fingerprint:string;id:string}>();
const read = (input: ManageBookingRequest) => {
  const item = bookings.get(input.bookingId);
  if (!item || item.token !== input.token) throw new ApiError('INVALID_LINK');
  return item.booking;
};
const delay = () => new Promise((resolve) => setTimeout(resolve, 180));

function findSlot(serviceIds: string[], barberId: string | null, startsAt: string, ignoreBooking?: string) {
  const date = bangkokDate(startsAt);
  const slot = availability({ serviceIds, barberId, date }, ignoreBooking).slots.find((s) => s.startsAt === startsAt);
  if (!slot) throw new ApiError('SLOT_UNAVAILABLE');
  return { date, slot, start: minutesOfDay(startsAt) };
}

export const fixtureApi: CustomerApi = {
  async getCatalog() { return structuredClone(catalog); },
  async getAvailability(input) { await delay(); return availability(input, input.management?.bookingId); },
  async createBooking(input) {
    const {turnstileToken: _, ...stable} = input;
    const fingerprint = JSON.stringify(stable), prior = requests.get(input.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new ApiError('IDEMPOTENCY_CONFLICT');
      return {booking:structuredClone(bookings.get(prior.id)!.booking),mode:'fixtures'};
    }
    await delay();
    const { chosen, length } = plan(input.serviceIds, input.barberId);
    const { date, slot, start } = findSlot(input.serviceIds, input.barberId, input.startsAt);
    const barber = barbers.find((b) => b.id === (input.barberId ?? slot.barberIds[0]))!;
    const id = crypto.randomUUID();
    reserve(date, barber.id, { start, end: start + length, bookingId: id });
    const total = chosen.reduce((sum, s) => sum + (s.priceBaht ?? 0), 0);
    const booking: BookingView = {id,reference:'TEST-NOT-A-REAL-BOOKING',status:'confirmed',startsAt:input.startsAt,
      endsAt:slot.endsAt,barber:{id:barber.id,name:barber.name},
      services:chosen.map((s) => ({id:s.id,name:s.name,priceBaht:s.priceBaht ?? 0,durationMinutes:s.durationMinutes ?? 0})),
      customerName:input.customer.name,totalBaht:total,
      cancellationDeadline:new Date(Date.parse(input.startsAt)-4*3600000).toISOString(),canChange:true,revision:1};
    bookings.set(id,{booking,token:input.manageToken}); requests.set(input.idempotencyKey,{fingerprint,id});
    return {booking:structuredClone(booking),mode:'fixtures'};
  },
  async getBooking(input) { return structuredClone(read(input)); },
  async cancelBooking(input) {
    const b=read(input); if(b.status==='cancelled') return structuredClone(b);
    if(b.revision!==input.expectedRevision) throw new ApiError('STALE_BOOKING');
    release(b.id); b.status='cancelled'; b.canChange=false; b.revision++; return structuredClone(b);
  },
  async rescheduleBooking(input) {
    const b=read(input); if(b.status!=='confirmed') throw new ApiError('BOOKING_NOT_CHANGEABLE');
    if(b.revision!==input.expectedRevision) throw new ApiError('STALE_BOOKING');
    const serviceIds = b.services.map((s) => s.id);
    const length = b.services.reduce((sum, s) => sum + s.durationMinutes, 0);
    const { date, slot, start } = findSlot(serviceIds, input.barberId, input.startsAt, b.id);
    const barber = barbers.find((x) => x.id === (input.barberId ?? slot.barberIds[0]))!;
    release(b.id); reserve(date, barber.id, { start, end: start + length, bookingId: b.id });
    b.barber = { id: barber.id, name: barber.name };
    b.startsAt=input.startsAt; b.endsAt=slot.endsAt;
    b.cancellationDeadline=new Date(Date.parse(input.startsAt)-4*3600000).toISOString();b.revision++;return structuredClone(b);
  },
};
