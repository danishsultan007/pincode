-- supabase/seed.sql — Mahadevapura demo data.
-- Run after all migrations, in the SQL editor. There is no JWT here (auth.uid() is null),
-- so triggers keep explicit timestamps/authors and skip rate caps and the content filter
-- ("No-JWT bypass", §2.0 convention 5).

set search_path = public, extensions;

-- ============================================================
-- 0. Lookup temp tables/functions used throughout this script
-- ============================================================
create temporary table pg_temp.su (
  n int, id uuid, username text, full_name text, area text, pincode text, city text, days_ago int
);
insert into pg_temp.su (n, id, username, full_name, area, pincode, city, days_ago) values
 (1, '00000000-0000-4000-8000-000000000001', 'priya_hoodi',         'Priya',           'Hoodi',        '560048', 'Bengaluru', 156),
 (2, '00000000-0000-4000-8000-000000000002', 'kavitha_cooks',       'Kavitha',         'Hoodi',        '560048', 'Bengaluru', 162),
 (3, '00000000-0000-4000-8000-000000000003', 'rohan_hoodi',         'Rohan',           'Hoodi',        '560048', 'Bengaluru', 168),
 (4, '00000000-0000-4000-8000-000000000004', 'anjali_mdp',          'Anjali',          'Mahadevapura', '560048', 'Bengaluru', 174),
 (5, '00000000-0000-4000-8000-000000000005', 'lakshmi_maid',        'Lakshmi',         'Mahadevapura', '560048', 'Bengaluru', 180),
 (6, '00000000-0000-4000-8000-000000000006', 'deepak_brookefield',  'Deepak',          'Brookefield',  '560037', 'Bengaluru', 186),
 (7, '00000000-0000-4000-8000-000000000007', 'suresh_krpuram',      'Suresh',          'Mahadevapura', '560048', 'Bengaluru', 192),
 (8, '00000000-0000-4000-8000-000000000008', 'meera_brookefield',   'Meera',           'Brookefield',  '560037', 'Bengaluru', 198),
 (9, '00000000-0000-4000-8000-000000000009', 'neha_marathahalli',   'Neha',            'Marathahalli', '560037', 'Bengaluru', 204),
 (10,'00000000-0000-4000-8000-000000000010', 'imran_marathahalli',  'Imran',           'Marathahalli', '560037', 'Bengaluru', 210),
 (11,'00000000-0000-4000-8000-000000000011', 'sunita_indiranagar',  'Sunita',          'Marathahalli', '560037', 'Bengaluru', 216),
 (12,'00000000-0000-4000-8000-000000000012', 'karthik_bellandur',   'Karthik',         'Bellandur',    '560103', 'Bengaluru', 222),
 (13,'00000000-0000-4000-8000-000000000013', 'vijay_bellandur',     'Vijay',           'Bellandur',    '560103', 'Bengaluru', 228),
 (14,'00000000-0000-4000-8000-000000000014', 'farah_koramangala',   'Farah',           'Bellandur',    '560103', 'Bengaluru', 234),
 (15,'00000000-0000-4000-8000-000000000015', 'arjun_krpuram',       'Arjun',           'KR Puram',     '560036', 'Bengaluru', 240),
 (16,'00000000-0000-4000-8000-000000000016', 'divya_mdp',           'Divya',           'Mahadevapura', '560048', 'Bengaluru', 246),
 (17,'00000000-0000-4000-8000-000000000017', 'nisha_brookefield',   'Nisha',           'Brookefield',  '560037', 'Bengaluru', 252),
 (18,'00000000-0000-4000-8000-000000000018', 'ganesh_brookefield',  'Ganesh',          'Brookefield',  '560037', 'Bengaluru', 258),
 (19,'00000000-0000-4000-8000-000000000019', 'iyer_sir',            'Mr. Iyer',        'Hoodi',        '560048', 'Bengaluru', 264),
 (20,'00000000-0000-4000-8000-000000000020', 'pooja_hoodi',         'Pooja',           'Hoodi',        '560048', 'Bengaluru', 270),
 (21,'00000000-0000-4000-8000-000000000021', 'ravi_hoodi',          'Ravi',            'Hoodi',        '560048', 'Bengaluru', 276),
 (22,'00000000-0000-4000-8000-000000000022', 'rekha_krpuram',       'Rekha',           'KR Puram',     '560036', 'Bengaluru', 282),
 (23,'00000000-0000-4000-8000-000000000023', 'anita_whitefield',    'Anita',           'Whitefield',   '560066', 'Bengaluru', 288),
 (24,'00000000-0000-4000-8000-000000000024', 'sneha_mdp',           'Sneha',           'Mahadevapura', '560048', 'Bengaluru', 294),
 (25,'00000000-0000-4000-8000-000000000025', 'kabir_indiranagar',   'Kabir',           'Indiranagar',  '560038', 'Bengaluru', 300),
 (26,'00000000-0000-4000-8000-000000000026', 'latha_indiranagar',   'Latha',           'Indiranagar',  '560038', 'Bengaluru', 306),
 (27,'00000000-0000-4000-8000-000000000027', 'ankit_delhi',         'Ankit',           'Hauz Khas',    '110016', 'Delhi',     312),
 (28,'00000000-0000-4000-8000-000000000028', 'farhan_mumbai',       'Farhan',          'Bandra West',  '400050', 'Mumbai',    318),
 (29,'00000000-0000-4000-8000-000000000029', 'zara_mumbai',         'Zara',            'Bandra West',  '400050', 'Mumbai',    324),
 (30,'00000000-0000-4000-8000-000000000030', 'kiran_hyderabad',     'Kiran',           'Madhapur',     '500033', 'Hyderabad', 330),
 (31,'00000000-0000-4000-8000-000000000031', 'bhavani_gachibowli',  'Bhavani',         'Gachibowli',   '500032', 'Hyderabad', 336),
 (32,'00000000-0000-4000-8000-000000000032', 'rwa_gachibowli',      'RWA Gachibowli',  'Gachibowli',   '500032', 'Hyderabad', 342);

create temporary table pg_temp.sc (n int, id uuid, slug text);
insert into pg_temp.sc (n, id, slug) values
 (1, '00000000-0000-4000-b000-000000000001', 'hoodi-neighbors'),
 (2, '00000000-0000-4000-b000-000000000002', 'mahadevapura-parents'),
 (3, '00000000-0000-4000-b000-000000000003', 'brookefield-pet-parents'),
 (4, '00000000-0000-4000-b000-000000000004', 'mahadevapura-wellness'),
 (5, '00000000-0000-4000-b000-000000000005', 'kr-puram-civic-watch'),
 (6, '00000000-0000-4000-b000-000000000006', 'bellandur-lake-volunteers'),
 (7, '00000000-0000-4000-b000-000000000007', 'indiranagar-foodies');

-- ============================================================
-- 1. Users
-- ============================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select s.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  lower(s.username) || '@demo.pincode.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', s.full_name),
  now() - (s.days_ago || ' days')::interval, now(),
  '', '', '', ''
from pg_temp.su s;

-- The on_auth_user_created trigger has now inserted profiles/private_profiles rows.
update public.profiles p set
  username = s.username,
  bio = 'Neighbor in ' || s.area || ', ' || s.city || '.',
  interests = '{}',
  home_area = s.area,
  home_pincode = s.pincode,
  home_city = s.city,
  onboarded_at = p.created_at
from pg_temp.su s where p.id = s.id;

-- ============================================================
-- 2. Communities
-- ============================================================
insert into public.communities (id, slug, name, description, rules, kind, category, lat, lng, radius_km,
  pincode, area, city, owner_id, created_at)
values
 ((select id from pg_temp.sc where slug='hoodi-neighbors'), 'hoodi-neighbors', 'Hoodi Neighbors',
  'For everyone living near Hoodi to share recommendations, alerts and local news. Say hello and tell us your block.',
  array['Be respectful and keep it local.','No spam or promotions.','Verify information before sharing alerts.'],
  'area', 'area', 12.9913, 77.7159, 2,
  '560048', 'Hoodi', 'Bengaluru', (select id from pg_temp.su where username='priya_hoodi'), now() - interval '150 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-parents'), 'mahadevapura-parents', 'Mahadevapura Parents',
  'A group for parents in and around Mahadevapura to swap school, activity and pediatrician recommendations.',
  array['Keep it kind — we are all figuring this out together.','No unsolicited selling.','Protect kids'' privacy in photos and posts.'],
  'interest', 'parents', 12.9915, 77.6944, 4,
  '560048', 'Mahadevapura', 'Bengaluru', (select id from pg_temp.su where username='divya_mdp'), now() - interval '140 days'),
 ((select id from pg_temp.sc where slug='brookefield-pet-parents'), 'brookefield-pet-parents', 'Brookefield Pet Parents',
  'Lost-and-found pets, vet recommendations and walk buddies for the Brookefield area.',
  array['Be kind to all animals.','Verify sightings before sharing.','No breeders or sales without mod approval.'],
  'interest', 'pets', 12.9680, 77.7150, 3,
  '560037', 'Brookefield', 'Bengaluru', (select id from pg_temp.su where username='nisha_brookefield'), now() - interval '130 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-wellness'), 'mahadevapura-wellness', 'Mahadevapura Wellness',
  'Morning walks, yoga sessions and fitness meetups around Mahadevapura.',
  array['Show up on time, respect the group''s pace.','No promotional spam for paid programs.','Be encouraging, not competitive.'],
  'interest', 'fitness', 12.9880, 77.6990, 4,
  '560048', 'Mahadevapura', 'Bengaluru', (select id from pg_temp.su where username='sneha_mdp'), now() - interval '120 days'),
 ((select id from pg_temp.sc where slug='kr-puram-civic-watch'), 'kr-puram-civic-watch', 'KR Puram Civic Watch',
  'Tracking civic issues — water, power, roads and safety — around KR Puram, and coordinating with the ward office.',
  array['Stick to verifiable civic issues.','No political campaigning.','Tag the exact location when reporting a problem.'],
  'area', 'civic', 13.0077, 77.6960, 3,
  '560036', 'KR Puram', 'Bengaluru', (select id from pg_temp.su where username='rekha_krpuram'), now() - interval '110 days'),
 ((select id from pg_temp.sc where slug='bellandur-lake-volunteers'), 'bellandur-lake-volunteers', 'Bellandur Lake Volunteers',
  'Volunteers working on lake clean-up drives and monitoring around Bellandur.',
  array['Wear protective gear at clean-ups.','Respect the wildlife.','Coordinate drives here before showing up.'],
  'interest', 'environment', 12.9260, 77.6762, 5,
  '560103', 'Bellandur', 'Bengaluru', (select id from pg_temp.su where username='karthik_bellandur'), now() - interval '100 days'),
 ((select id from pg_temp.sc where slug='indiranagar-foodies'), 'indiranagar-foodies', 'Indiranagar Foodies',
  'Recommendations, pop-ups and reviews for food lovers around Indiranagar.',
  array['Disclose free meals or discounts you received.','Be constructive with criticism.','No delivery-app referral spam.'],
  'interest', 'food', 12.9784, 77.6408, 3,
  '560038', 'Indiranagar', 'Bengaluru', (select id from pg_temp.su where username='kabir_indiranagar'), now() - interval '90 days');

insert into public.community_members (community_id, user_id, role, notify_posts, joined_at) values
 ((select id from pg_temp.sc where slug='hoodi-neighbors'), (select id from pg_temp.su where username='priya_hoodi'), 'owner', true, now() - interval '150 days'),
 ((select id from pg_temp.sc where slug='hoodi-neighbors'), (select id from pg_temp.su where username='rohan_hoodi'), 'moderator', true, now() - interval '145 days'),
 ((select id from pg_temp.sc where slug='hoodi-neighbors'), (select id from pg_temp.su where username='kavitha_cooks'), 'member', true, now() - interval '120 days'),
 ((select id from pg_temp.sc where slug='hoodi-neighbors'), (select id from pg_temp.su where username='pooja_hoodi'), 'member', false, now() - interval '100 days'),
 ((select id from pg_temp.sc where slug='hoodi-neighbors'), (select id from pg_temp.su where username='ravi_hoodi'), 'member', true, now() - interval '90 days'),
 ((select id from pg_temp.sc where slug='hoodi-neighbors'), (select id from pg_temp.su where username='iyer_sir'), 'member', false, now() - interval '80 days'),
 ((select id from pg_temp.sc where slug='hoodi-neighbors'), (select id from pg_temp.su where username='anjali_mdp'), 'member', false, now() - interval '70 days'),

 ((select id from pg_temp.sc where slug='mahadevapura-parents'), (select id from pg_temp.su where username='divya_mdp'), 'owner', true, now() - interval '140 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-parents'), (select id from pg_temp.su where username='anjali_mdp'), 'moderator', true, now() - interval '135 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-parents'), (select id from pg_temp.su where username='sneha_mdp'), 'member', true, now() - interval '110 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-parents'), (select id from pg_temp.su where username='suresh_krpuram'), 'member', false, now() - interval '95 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-parents'), (select id from pg_temp.su where username='priya_hoodi'), 'member', false, now() - interval '85 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-parents'), (select id from pg_temp.su where username='lakshmi_maid'), 'member', false, now() - interval '75 days'),

 ((select id from pg_temp.sc where slug='brookefield-pet-parents'), (select id from pg_temp.su where username='nisha_brookefield'), 'owner', true, now() - interval '130 days'),
 ((select id from pg_temp.sc where slug='brookefield-pet-parents'), (select id from pg_temp.su where username='ganesh_brookefield'), 'moderator', true, now() - interval '125 days'),
 ((select id from pg_temp.sc where slug='brookefield-pet-parents'), (select id from pg_temp.su where username='deepak_brookefield'), 'member', false, now() - interval '100 days'),
 ((select id from pg_temp.sc where slug='brookefield-pet-parents'), (select id from pg_temp.su where username='meera_brookefield'), 'member', true, now() - interval '90 days'),
 ((select id from pg_temp.sc where slug='brookefield-pet-parents'), (select id from pg_temp.su where username='vijay_bellandur'), 'member', false, now() - interval '80 days'),
 ((select id from pg_temp.sc where slug='brookefield-pet-parents'), (select id from pg_temp.su where username='farah_koramangala'), 'member', false, now() - interval '70 days'),

 ((select id from pg_temp.sc where slug='mahadevapura-wellness'), (select id from pg_temp.su where username='sneha_mdp'), 'owner', true, now() - interval '120 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-wellness'), (select id from pg_temp.su where username='divya_mdp'), 'member', true, now() - interval '110 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-wellness'), (select id from pg_temp.su where username='suresh_krpuram'), 'member', false, now() - interval '100 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-wellness'), (select id from pg_temp.su where username='anjali_mdp'), 'member', false, now() - interval '90 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-wellness'), (select id from pg_temp.su where username='priya_hoodi'), 'member', false, now() - interval '80 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-wellness'), (select id from pg_temp.su where username='rekha_krpuram'), 'member', false, now() - interval '70 days'),
 ((select id from pg_temp.sc where slug='mahadevapura-wellness'), (select id from pg_temp.su where username='arjun_krpuram'), 'member', false, now() - interval '60 days'),

 ((select id from pg_temp.sc where slug='kr-puram-civic-watch'), (select id from pg_temp.su where username='rekha_krpuram'), 'owner', true, now() - interval '110 days'),
 ((select id from pg_temp.sc where slug='kr-puram-civic-watch'), (select id from pg_temp.su where username='arjun_krpuram'), 'moderator', true, now() - interval '105 days'),
 ((select id from pg_temp.sc where slug='kr-puram-civic-watch'), (select id from pg_temp.su where username='suresh_krpuram'), 'member', true, now() - interval '90 days'),
 ((select id from pg_temp.sc where slug='kr-puram-civic-watch'), (select id from pg_temp.su where username='divya_mdp'), 'member', false, now() - interval '80 days'),
 ((select id from pg_temp.sc where slug='kr-puram-civic-watch'), (select id from pg_temp.su where username='sneha_mdp'), 'member', false, now() - interval '70 days'),
 ((select id from pg_temp.sc where slug='kr-puram-civic-watch'), (select id from pg_temp.su where username='ravi_hoodi'), 'member', false, now() - interval '60 days'),

 ((select id from pg_temp.sc where slug='bellandur-lake-volunteers'), (select id from pg_temp.su where username='karthik_bellandur'), 'owner', true, now() - interval '100 days'),
 ((select id from pg_temp.sc where slug='bellandur-lake-volunteers'), (select id from pg_temp.su where username='vijay_bellandur'), 'member', true, now() - interval '90 days'),
 ((select id from pg_temp.sc where slug='bellandur-lake-volunteers'), (select id from pg_temp.su where username='farah_koramangala'), 'member', false, now() - interval '80 days'),
 ((select id from pg_temp.sc where slug='bellandur-lake-volunteers'), (select id from pg_temp.su where username='meera_brookefield'), 'member', false, now() - interval '70 days'),
 ((select id from pg_temp.sc where slug='bellandur-lake-volunteers'), (select id from pg_temp.su where username='deepak_brookefield'), 'member', false, now() - interval '60 days'),

 ((select id from pg_temp.sc where slug='indiranagar-foodies'), (select id from pg_temp.su where username='kabir_indiranagar'), 'owner', true, now() - interval '90 days'),
 ((select id from pg_temp.sc where slug='indiranagar-foodies'), (select id from pg_temp.su where username='latha_indiranagar'), 'member', true, now() - interval '80 days'),
 ((select id from pg_temp.sc where slug='indiranagar-foodies'), (select id from pg_temp.su where username='sunita_indiranagar'), 'member', false, now() - interval '70 days'),
 ((select id from pg_temp.sc where slug='indiranagar-foodies'), (select id from pg_temp.su where username='lakshmi_maid'), 'member', false, now() - interval '60 days'),
 ((select id from pg_temp.sc where slug='indiranagar-foodies'), (select id from pg_temp.su where username='ravi_hoodi'), 'member', false, now() - interval '50 days');

-- ============================================================
-- 3. Posts — transcribed from store.js -> seedPosts() (26 posts)
-- ============================================================
insert into public.posts (id, author_id, community_id, type, kind, tag, title, body, phone_e164,
  lat, lng, pincode, area, city, starts_at, ends_at, created_at)
values
 -- ---- Mahadevapura belt ----
 ('00000000-0000-4000-9000-000000000101', (select id from pg_temp.su where username='priya_hoodi'),
  (select id from pg_temp.sc where slug='hoodi-neighbors'), 'ask', 'request', 'cook',
  'Looking for a cook for lunch + dinner, veg, near Hoodi',
  'Family of four, vegetarian, 6 days a week. Happy to pay well for someone reliable. Prefer someone who can start next week.',
  null, 12.9913, 77.7159, '560048', 'Hoodi', 'Bengaluru', null, null, now() - interval '5 hours'),
 ('00000000-0000-4000-9000-000000000102', (select id from pg_temp.su where username='lakshmi_maid'), null,
  'ask', 'offer', 'maid',
  'Part-time house help available, mornings',
  '8 years experience, references from two nearby families. Sweeping, mopping, utensils. Looking for 2 more houses.',
  '+919845012345', 12.9926, 77.6946, '560048', 'Mahadevapura', 'Bengaluru', null, null, now() - interval '1 days'),
 ('00000000-0000-4000-9000-000000000103', (select id from pg_temp.su where username='deepak_brookefield'), null,
  'ask', 'request', 'repair',
  'Good carpenter for wardrobe hinges and a sagging door?',
  'Two wardrobe doors don''t close properly and the bedroom door is dragging on the floor. Need someone honest who does small jobs.',
  null, 12.9667, 77.7167, '560037', 'Brookefield', 'Bengaluru', null, null, now() - interval '2 days'),
 ('00000000-0000-4000-9000-000000000104', (select id from pg_temp.su where username='neha_marathahalli'), null,
  'ask', 'request', 'repair',
  'Sofa re-upholstery recommendations?',
  'A 3-seater sofa with a sagging cushion base. Looking for someone who can re-do the fabric and foam.',
  null, 12.9569, 77.7011, '560037', 'Marathahalli', 'Bengaluru', null, null, now() - interval '21 days'),
 ('00000000-0000-4000-9000-000000000105', (select id from pg_temp.su where username='karthik_bellandur'), null,
  'ask', 'request', 'plumber',
  'Plumber for a bathroom leak, Bellandur',
  'Slow leak behind the bathroom wall, seepage into the next room. Need someone who can find the source without breaking everything.',
  null, 12.9260, 77.6762, '560103', 'Bellandur', 'Bengaluru', null, null, now() - interval '40 days'),
 ('00000000-0000-4000-9000-000000000106', (select id from pg_temp.su where username='arjun_krpuram'), null,
  'ask', 'request', 'electrician',
  'Electrician today — MCB keeps tripping',
  'The main MCB trips every few minutes since this morning. Anyone have a reliable electrician near KR Puram who can come today?',
  null, 13.0077, 77.6960, '560036', 'KR Puram', 'Bengaluru', null, null, now() - interval '40 minutes'),
 ('00000000-0000-4000-9000-000000000107', (select id from pg_temp.su where username='divya_mdp'),
  (select id from pg_temp.sc where slug='mahadevapura-parents'), 'ask', 'request', 'doctor',
  'Pediatrician open on Sundays nearby?',
  'Toddler with a mild fever, our regular clinic is closed on Sundays. Any recommendations close to Mahadevapura?',
  null, 12.9930, 77.6920, '560048', 'Mahadevapura', 'Bengaluru', null, null, now() - interval '10 minutes'),
 ('00000000-0000-4000-9000-000000000108', (select id from pg_temp.su where username='nisha_brookefield'),
  (select id from pg_temp.sc where slug='brookefield-pet-parents'), 'ask', 'request', 'pets',
  'Lost: brown indie dog ''Bruno'', red collar',
  'Went missing near the Brookefield park gate this morning. Very friendly, answers to Bruno. Please call if seen.',
  null, 12.9680, 77.7150, '560037', 'Brookefield', 'Bengaluru', null, null, now() - interval '8 hours'),
 ('00000000-0000-4000-9000-000000000109', (select id from pg_temp.su where username='iyer_sir'),
  (select id from pg_temp.sc where slug='hoodi-neighbors'), 'ask', 'offer', 'other',
  'Offering maths tuition, classes 6–8',
  'Retired teacher, 30 years experience. Small groups of up to four, evenings near Hoodi.',
  null, 12.9900, 77.7140, '560048', 'Hoodi', 'Bengaluru', null, null, now() - interval '3 days'),
 ('00000000-0000-4000-9000-000000000110', (select id from pg_temp.su where username='ravi_hoodi'), null,
  'alert', null, null,
  'ORR service road jammed near Hoodi junction — metro work',
  'One lane closed for barricading. Expect 20–30 min delays towards Marathahalli. Main ORR is moving better.',
  null, 12.9920, 77.7150, '560048', 'Hoodi', 'Bengaluru', null, null, now() - interval '90 minutes'),
 ('00000000-0000-4000-9000-000000000111', (select id from pg_temp.su where username='suresh_krpuram'), null,
  'alert', null, null,
  'BESCOM power cut, expected back ~4 pm',
  'Planned maintenance on the feeder line. Ward 84 and nearby apartments affected.',
  null, 12.9905, 77.6960, '560048', 'Mahadevapura', 'Bengaluru', null, now() + interval '3 hours', now() - interval '3 hours'),
 ('00000000-0000-4000-9000-000000000112', (select id from pg_temp.su where username='rekha_krpuram'),
  (select id from pg_temp.sc where slug='kr-puram-civic-watch'), 'alert', null, null,
  'No Cauvery water supply today, tankers near the temple',
  'Pipeline repair, supply resumes tomorrow morning. Tankers are stationed by the temple on the main road.',
  null, 13.0070, 77.6975, '560036', 'KR Puram', 'Bengaluru', null, null, now() - interval '6 hours'),
 ('00000000-0000-4000-9000-000000000113', (select id from pg_temp.su where username='anita_whitefield'), null,
  'event', null, null,
  'Sunday flea market at our apartment clubhouse',
  'Local sellers, home bakers, plants and handmade jewellery. Open to everyone, entry from the main gate.',
  null, 12.9698, 77.7500, '560066', 'Whitefield', 'Bengaluru',
  now() + interval '2 days', (now() + interval '2 days') + interval '8 hours', now() - interval '1 days'),
 ('00000000-0000-4000-9000-000000000114', (select id from pg_temp.su where username='sneha_mdp'),
  (select id from pg_temp.sc where slug='mahadevapura-wellness'), 'event', null, null,
  'Saturday morning yoga by the lake, all welcome',
  'Bring your own mat. A gentle session for beginners, followed by tea.',
  null, 12.9880, 77.6990, '560048', 'Mahadevapura', 'Bengaluru',
  now() + interval '1 days', (now() + interval '1 days') + interval '2 hours', now() - interval '12 hours'),

 -- ---- Other neighbourhoods ----
 ('00000000-0000-4000-9000-000000000201', (select id from pg_temp.su where username='ravi_hoodi'), null,
  'alert', null, null,
  '100 Feet Road partially blocked near CMH junction',
  'Metro pillar work has one lane closed since morning. Heavy backup towards Domlur.',
  null, 12.9719, 77.6412, '560038', 'Indiranagar', 'Bengaluru', null, null, now() - interval '2 hours'),
 ('00000000-0000-4000-9000-000000000202', (select id from pg_temp.su where username='lakshmi_maid'), null,
  'ask', 'offer', 'maid',
  'Reliable maid available, mornings',
  '8 years experience, references available. Looking for 2–3 houses in the area.',
  '+919845098765', 12.9720, 77.6410, '560038', 'Indiranagar', 'Bengaluru', null, null, now() - interval '1 days'),
 ('00000000-0000-4000-9000-000000000203', (select id from pg_temp.su where username='kabir_indiranagar'),
  (select id from pg_temp.sc where slug='indiranagar-foodies'), 'ask', 'request', 'electrician',
  'Anyone know a good electrician nearby?',
  'Need someone for a small rewiring job, not urgent.',
  null, 12.9715, 77.6402, '560038', 'Indiranagar', 'Bengaluru', null, null, now() - interval '6 hours'),
 ('00000000-0000-4000-9000-000000000204', (select id from pg_temp.su where username='deepak_brookefield'), null,
  'alert', null, null,
  'Waterlogging near Sony World signal',
  'Rain last night flooded the underpass, avoid two-wheelers.',
  null, 12.9352, 77.6245, '560034', 'Koramangala', 'Bengaluru', null, null, now() - interval '4 hours'),
 ('00000000-0000-4000-9000-000000000205', (select id from pg_temp.su where username='farah_koramangala'), null,
  'ask', 'request', 'pets',
  'Street dog needs a home',
  'Friendly, vaccinated, currently being fed by residents near 6th block.',
  null, 12.9361, 77.6259, '560034', 'Koramangala', 'Bengaluru', null, null, now() - interval '2 days'),
 ('00000000-0000-4000-9000-000000000206', (select id from pg_temp.su where username='ankit_delhi'), null,
  'alert', null, null,
  'Road dug up near Hauz Khas metro gate 2',
  'Sewer line work, expect delays till evening.',
  null, 28.5494, 77.2001, '110016', 'Hauz Khas', 'Delhi', null, null, now() - interval '3 hours'),
 ('00000000-0000-4000-9000-000000000207', (select id from pg_temp.su where username='sunita_indiranagar'), null,
  'ask', 'offer', 'cook',
  'Experienced cook available, full-time',
  'North and South Indian cooking, currently free from next month.',
  '+919899011223', 28.5501, 77.1988, '110016', 'Hauz Khas', 'Delhi', null, null, now() - interval '36 hours'),
 ('00000000-0000-4000-9000-000000000208', (select id from pg_temp.su where username='farhan_mumbai'), null,
  'alert', null, null,
  'Linking Road traffic diversion',
  'BMC repaving work, use SV Road as an alternate route.',
  null, 19.0596, 72.8295, '400050', 'Bandra West', 'Mumbai', null, null, now() - interval '6 hours'),
 ('00000000-0000-4000-9000-000000000209', (select id from pg_temp.su where username='zara_mumbai'), null,
  'ask', 'request', 'maid',
  'Need a part-time nanny, afternoons',
  '2–6pm on weekdays, for a 4-year-old.',
  null, 19.0610, 72.8301, '400050', 'Bandra West', 'Mumbai', null, null, now() - interval '12 hours'),
 ('00000000-0000-4000-9000-000000000210', (select id from pg_temp.su where username='kiran_hyderabad'), null,
  'alert', null, null,
  'Scheduled power shutdown, Madhapur',
  'TSSPDCL maintenance 10am–2pm tomorrow.',
  null, 17.4483, 78.3915, '500033', 'Madhapur', 'Hyderabad', null, now() + interval '20 hours', now() - interval '4 hours'),
 ('00000000-0000-4000-9000-000000000211', (select id from pg_temp.su where username='divya_mdp'), null,
  'ask', 'request', 'doctor',
  'Recommendations for a good pediatrician?',
  'Recently moved to the area, looking for someone nearby.',
  null, 17.4425, 78.3467, '500032', 'Gachibowli', 'Hyderabad', null, null, now() - interval '18 hours'),
 ('00000000-0000-4000-9000-000000000212', (select id from pg_temp.su where username='rwa_gachibowli'), null,
  'event', null, null,
  'Society Ganesh Chaturthi celebration',
  'Evening aarti and dinner, all residents welcome.',
  null, 17.4408, 78.3502, '500032', 'Gachibowli', 'Hyderabad',
  now() + interval '4 days', (now() + interval '4 days') + interval '6 hours', now() - interval '2 days');

-- ============================================================
-- 4. Comments (top-level, then nested replies)
-- ============================================================
insert into public.comments (id, post_id, author_id, parent_id, body, created_at) values
 ('00000000-0000-4000-a000-000101000001', '00000000-0000-4000-9000-000000000101', (select id from pg_temp.su where username='kavitha_cooks'), null,
  'Our cook Sumathi is excellent, vegetarian specialist, works in Hoodi already. Happy to share her number.',
  (now() - interval '5 hours') + interval '18 minutes'),
 ('00000000-0000-4000-a000-000101000002', '00000000-0000-4000-9000-000000000101', (select id from pg_temp.su where username='rohan_hoodi'), null,
  'Try the notice board at the Hoodi Circle market, a few cooks post there.',
  (now() - interval '5 hours') + interval '45 minutes'),
 ('00000000-0000-4000-a000-000101000003', '00000000-0000-4000-9000-000000000101', (select id from pg_temp.su where username='anjali_mdp'), null,
  'We use an agency, Sri Sai Services. Bit costly but replacements are guaranteed.',
  (now() - interval '5 hours') + interval '2 hours'),

 ('00000000-0000-4000-a000-000103000001', '00000000-0000-4000-9000-000000000103', (select id from pg_temp.su where username='suresh_krpuram'), null,
  'Ramesh carpenter near Kundalahalli gate, fixed my wardrobe for 600 rupees. Very neat work.',
  (now() - interval '2 days') + interval '25 minutes'),
 ('00000000-0000-4000-a000-000103000002', '00000000-0000-4000-9000-000000000103', (select id from pg_temp.su where username='meera_brookefield'), null,
  'Second Ramesh. He also does polish touch-ups if you ask.',
  (now() - interval '2 days') + interval '3 hours'),

 ('00000000-0000-4000-a000-000104000001', '00000000-0000-4000-9000-000000000104', (select id from pg_temp.su where username='imran_marathahalli'), null,
  'Ali Furnishings on Marathahalli bridge service road. Did our sofa in 4 days, fair price.',
  (now() - interval '21 days') + interval '40 minutes'),
 ('00000000-0000-4000-a000-000104000002', '00000000-0000-4000-9000-000000000104', (select id from pg_temp.su where username='sunita_indiranagar'), null,
  'Agree with Ali. Ask for the high-density foam, it lasts longer.',
  (now() - interval '21 days') + interval '6 hours'),

 ('00000000-0000-4000-a000-000105000001', '00000000-0000-4000-9000-000000000105', (select id from pg_temp.su where username='vijay_bellandur'), null,
  'Use Mahesh, he has a moisture meter. Found ours in ten minutes.',
  (now() - interval '40 days') + interval '55 minutes'),
 ('00000000-0000-4000-a000-000105000002', '00000000-0000-4000-9000-000000000105', (select id from pg_temp.su where username='farah_koramangala'), null,
  'Seconded. Cheaper than the app-based services too.',
  (now() - interval '40 days') + interval '4 hours'),

 ('00000000-0000-4000-a000-000108000001', '00000000-0000-4000-9000-000000000108', (select id from pg_temp.su where username='ganesh_brookefield'), null,
  'Saw a brown dog with a red collar near the ITPL back gate around 2 pm.',
  (now() - interval '8 hours') + interval '90 minutes'),

 ('00000000-0000-4000-a000-000109000001', '00000000-0000-4000-9000-000000000109', (select id from pg_temp.su where username='pooja_hoodi'), null,
  'Do you take a trial class? My son is in class 7.',
  (now() - interval '3 days') + interval '4 hours'),

 ('00000000-0000-4000-a000-000203000001', '00000000-0000-4000-9000-000000000203', (select id from pg_temp.su where username='latha_indiranagar'), null,
  'Try Manjunath, 98450 33221 area. Did our whole flat, very tidy.',
  (now() - interval '6 hours') + interval '35 minutes'),

 ('00000000-0000-4000-a000-000211000001', '00000000-0000-4000-9000-000000000211', (select id from pg_temp.su where username='bhavani_gachibowli'), null,
  'Dr. Rao''s clinic near the Gachibowli flyover, very patient with kids.',
  (now() - interval '18 hours') + interval '70 minutes');

-- Nested replies (threads) — parents already exist above.
insert into public.comments (id, post_id, author_id, parent_id, body, created_at) values
 ('00000000-0000-4000-a000-000101000004', '00000000-0000-4000-9000-000000000101', (select id from pg_temp.su where username='priya_hoodi'),
  '00000000-0000-4000-a000-000101000001', 'That would be great, messaging you now.',
  (now() - interval '5 hours') + interval '25 minutes'),
 ('00000000-0000-4000-a000-000101000005', '00000000-0000-4000-9000-000000000101', (select id from pg_temp.su where username='kavitha_cooks'),
  '00000000-0000-4000-a000-000101000004', 'Sent you her details.',
  (now() - interval '5 hours') + interval '35 minutes'),

 ('00000000-0000-4000-a000-000103000003', '00000000-0000-4000-9000-000000000103', (select id from pg_temp.su where username='deepak_brookefield'),
  '00000000-0000-4000-a000-000103000001', 'Do you have his number?',
  (now() - interval '2 days') + interval '35 minutes'),
 ('00000000-0000-4000-a000-000103000004', '00000000-0000-4000-9000-000000000103', (select id from pg_temp.su where username='suresh_krpuram'),
  '00000000-0000-4000-a000-000103000003', 'Messaged you on pincode.',
  (now() - interval '2 days') + interval '45 minutes'),

 ('00000000-0000-4000-a000-000108000002', '00000000-0000-4000-9000-000000000108', (select id from pg_temp.su where username='nisha_brookefield'),
  '00000000-0000-4000-a000-000108000001', 'Thank you! Heading there now.',
  (now() - interval '8 hours') + interval '100 minutes');

-- ============================================================
-- 5. Votes and confirmations
-- ============================================================
create function pg_temp.seed_post_votes(p uuid, cnt int) returns void language plpgsql as $$
begin
  if cnt <= 0 then return; end if;
  insert into public.post_votes(post_id, user_id)
  select p, s.id from pg_temp.su s
  where s.id <> (select author_id from public.posts where id = p)
  order by s.n limit cnt;
end $$;

create function pg_temp.seed_comment_votes(c uuid, cnt int) returns void language plpgsql as $$
begin
  if cnt <= 0 then return; end if;
  insert into public.comment_votes(comment_id, user_id)
  select c, s.id from pg_temp.su s
  where s.id <> (select author_id from public.comments where id = c)
  order by s.n limit cnt;
end $$;

create function pg_temp.seed_still_on(p uuid, cnt int) returns void language plpgsql as $$
begin
  if cnt <= 0 then return; end if;
  insert into public.alert_confirmations(post_id, user_id, kind)
  select p, s.id, 'still_on' from pg_temp.su s
  where s.id <> (select author_id from public.posts where id = p)
  order by s.n limit cnt;
end $$;

-- Post upvotes (0 skipped: mdp-07 has 0)
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000101', 6);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000102', 3);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000103', 5);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000104', 4);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000105', 2);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000106', 1);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000108', 9);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000109', 2);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000110', 8);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000111', 4);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000112', 5);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000113', 7);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000114', 6);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000201', 2);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000202', 2);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000203', 7);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000204', 7);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000205', 11);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000206', 4);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000207', 3);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000208', 3);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000209', 8);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000210', 2);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000211', 1);
select pg_temp.seed_post_votes('00000000-0000-4000-9000-000000000212', 6);

-- Comment "helpful" votes
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000101000001', 4);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000101000002', 2);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000103000001', 3);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000103000002', 1);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000104000001', 5);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000104000002', 2);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000105000001', 3);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000105000002', 1);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000108000001', 1);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000203000001', 2);
select pg_temp.seed_comment_votes('00000000-0000-4000-a000-000211000001', 1);

-- Alert "still on" confirmations
select pg_temp.seed_still_on('00000000-0000-4000-9000-000000000110', 3);
select pg_temp.seed_still_on('00000000-0000-4000-9000-000000000201', 2);
select pg_temp.seed_still_on('00000000-0000-4000-9000-000000000204', 1);

-- ============================================================
-- 6. Solved answers
-- ============================================================
select public._set_solved('00000000-0000-4000-9000-000000000101', '00000000-0000-4000-a000-000101000001');
select public._set_solved('00000000-0000-4000-9000-000000000103', '00000000-0000-4000-a000-000103000001');
select public._set_solved('00000000-0000-4000-9000-000000000104', '00000000-0000-4000-a000-000104000001');
select public._set_solved('00000000-0000-4000-9000-000000000105', '00000000-0000-4000-a000-000105000001');

-- ============================================================
-- 7. Reactions
-- ============================================================
insert into public.comment_reactions (comment_id, user_id, reaction) values
 ('00000000-0000-4000-a000-000101000001', (select id from pg_temp.su where username='priya_hoodi'), 'thanks'),
 ('00000000-0000-4000-a000-000101000001', (select id from pg_temp.su where username='rohan_hoodi'), 'thanks'),
 ('00000000-0000-4000-a000-000101000001', (select id from pg_temp.su where username='anjali_mdp'), 'thanks'),
 ('00000000-0000-4000-a000-000101000001', (select id from pg_temp.su where username='lakshmi_maid'), 'like'),
 ('00000000-0000-4000-a000-000101000001', (select id from pg_temp.su where username='deepak_brookefield'), 'like'),
 ('00000000-0000-4000-a000-000104000001', (select id from pg_temp.su where username='neha_marathahalli'), 'thanks'),
 ('00000000-0000-4000-a000-000104000001', (select id from pg_temp.su where username='sunita_indiranagar'), 'thanks'),
 ('00000000-0000-4000-a000-000108000001', (select id from pg_temp.su where username='nisha_brookefield'), 'love');

-- ============================================================
-- 8. Sanity check (expect 26)
-- ============================================================
select count(*) from posts;
