-- Honest owner-editable placeholders only. Real online booking remains disabled.
insert into public.shop_settings(id) values (true) on conflict do nothing;
insert into public.shop_hours(weekday) select generate_series(0,6) on conflict do nothing;
insert into public.services(id, name, description) values
 ('10000000-0000-4000-8000-000000000001', '{"th":"บริการตัวอย่าง — รอเจ้าของร้านยืนยัน","en":"Placeholder service — owner confirmation required"}', '{"th":"ยังไม่กำหนดราคาและระยะเวลา","en":"Price and duration not configured"}')
on conflict do nothing;
insert into public.barbers(id, name) values
 ('20000000-0000-4000-8000-000000000001', '{"th":"ช่างตัวอย่าง — รอเจ้าของร้านยืนยัน","en":"Placeholder barber — owner confirmation required"}')
on conflict do nothing;
insert into public.gallery_items(id, caption, published) values
 ('30000000-0000-4000-8000-000000000001', '{"th":"พื้นที่สำหรับรูปผลงานจริงของร้าน","en":"Placeholder for an actual shop haircut photo"}', true)
on conflict do nothing;
