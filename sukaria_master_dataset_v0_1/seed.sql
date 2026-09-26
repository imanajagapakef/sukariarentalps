-- Suka Ria Rental PS
-- seed.sql
-- Dataset version: v0.1
-- IMPORTANT: This is a DRAFT seed for the proposed schema.
-- Review table names/columns against the final migration before production.
-- All values marked DRAFT are provisional and require owner confirmation.

BEGIN;

-- Recommended enums / tables are assumed to exist in the final schema.
-- This seed uses ON CONFLICT on stable business IDs.

INSERT INTO businesses (business_id, brand_name, business_type, city, province, country, timezone, operating_hours, instagram, website, online_booking, online_payment_provider, currency, data_status)
VALUES
('BUS-SUKARIA', 'Klub Sukaria', 'Gaming House / PS Rental', 'Tanjungpinang', 'Kepulauan Riau', 'Indonesia', 'Asia/Jakarta', '24 jam', '@klubsukaria', NULL, TRUE, 'MIDTRANS', 'IDR', 'SOURCE')
ON CONFLICT (business_id) DO UPDATE SET
brand_name = EXCLUDED.brand_name,
business_type = EXCLUDED.business_type,
city = EXCLUDED.city,
province = EXCLUDED.province,
country = EXCLUDED.country,
timezone = EXCLUDED.timezone,
operating_hours = EXCLUDED.operating_hours,
instagram = EXCLUDED.instagram,
website = EXCLUDED.website,
online_booking = EXCLUDED.online_booking,
online_payment_provider = EXCLUDED.online_payment_provider,
currency = EXCLUDED.currency,
data_status = EXCLUDED.data_status;

INSERT INTO branches (branch_id, branch_code, name, short_name, address, phone, operating_hours, google_rating, google_review_count, status, data_status)
VALUES
('BR-B5', 'B5', 'Sukaria Batu 5', 'Batu 5', 'Jalan Raja Haji Fisabilillah, Sei Jang, Kec. Bukit Bestari, Kota Tanjung Pinang, Kepulauan Riau 29122', '0831-4296-8507', '24 jam', 4.7, 32, 'ACTIVE', 'SOURCE'),
('BR-GANET', 'GANET', 'Sukaria Ganet', 'Ganet', 'Jl. Bandara, Pinang Kencana, Kec. Tanjungpinang Timur, Kota Tanjung Pinang, Kepulauan Riau 29140', '0853-7625-1323', '24 jam', 4.6, 30, 'ACTIVE', 'SOURCE')
ON CONFLICT (branch_id) DO UPDATE SET
branch_code = EXCLUDED.branch_code,
name = EXCLUDED.name,
short_name = EXCLUDED.short_name,
address = EXCLUDED.address,
phone = EXCLUDED.phone,
operating_hours = EXCLUDED.operating_hours,
google_rating = EXCLUDED.google_rating,
google_review_count = EXCLUDED.google_review_count,
status = EXCLUDED.status,
data_status = EXCLUDED.data_status;

INSERT INTO facility_types (facility_type_id, code, name, platform, category, data_status)
VALUES
('FAC-REGULAR', 'REGULAR', 'Regular', 'PS5', 'RENTAL', 'SOURCE'),
('FAC-CAPSULE', 'CAPSULE', 'Capsule', 'PS5', 'RENTAL', 'SOURCE'),
('FAC-VIP', 'VIP', 'VIP', 'PS5', 'RENTAL', 'SOURCE'),
('FAC-VVIP', 'VVIP', 'VVIP', 'PS5', 'RENTAL', 'SOURCE'),
('FAC-STEERING', 'STEERING', 'Steering Wheel', 'PS5', 'RACING', 'SOURCE'),
('FAC-SWITCH', 'SWITCH', 'Nintendo Switch', 'Nintendo Switch', 'CONSOLE', 'SOURCE'),
('FAC-PSVR2', 'PSVR2', 'PSVR2', 'PS5', 'VR', 'SOURCE')
ON CONFLICT (facility_type_id) DO UPDATE SET
code = EXCLUDED.code,
name = EXCLUDED.name,
platform = EXCLUDED.platform,
category = EXCLUDED.category,
data_status = EXCLUDED.data_status;

INSERT INTO units (unit_id, branch_id, facility_type_id, name, status, condition, data_status)
VALUES
('B5-R01', 'BR-B5', 'FAC-REGULAR', 'Regular 01', 'AVAILABLE', 'GOOD', 'DRAFT'),
('B5-R02', 'BR-B5', 'FAC-REGULAR', 'Regular 02', 'AVAILABLE', 'GOOD', 'DRAFT'),
('B5-R03', 'BR-B5', 'FAC-REGULAR', 'Regular 03', 'AVAILABLE', 'GOOD', 'DRAFT'),
('B5-R04', 'BR-B5', 'FAC-REGULAR', 'Regular 04', 'AVAILABLE', 'GOOD', 'DRAFT'),
('B5-R05', 'BR-B5', 'FAC-REGULAR', 'Regular 05', 'AVAILABLE', 'GOOD', 'DRAFT'),
('B5-R06', 'BR-B5', 'FAC-REGULAR', 'Regular 06', 'AVAILABLE', 'GOOD', 'DRAFT'),
('B5-C01', 'BR-B5', 'FAC-CAPSULE', 'Capsule 01', 'AVAILABLE', 'GOOD', 'DRAFT'),
('B5-C02', 'BR-B5', 'FAC-CAPSULE', 'Capsule 02', 'AVAILABLE', 'GOOD', 'DRAFT'),
('B5-S01', 'BR-B5', 'FAC-STEERING', 'Steering 01', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-R01', 'BR-GANET', 'FAC-REGULAR', 'Regular 01', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-R02', 'BR-GANET', 'FAC-REGULAR', 'Regular 02', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-R03', 'BR-GANET', 'FAC-REGULAR', 'Regular 03', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-R04', 'BR-GANET', 'FAC-REGULAR', 'Regular 04', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-R05', 'BR-GANET', 'FAC-REGULAR', 'Regular 05', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-R06', 'BR-GANET', 'FAC-REGULAR', 'Regular 06', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-C01', 'BR-GANET', 'FAC-CAPSULE', 'Capsule 01', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-C02', 'BR-GANET', 'FAC-CAPSULE', 'Capsule 02', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-V01', 'BR-GANET', 'FAC-VIP', 'VIP 01', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-V02', 'BR-GANET', 'FAC-VIP', 'VIP 02', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-VV01', 'BR-GANET', 'FAC-VVIP', 'VVIP 01', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-SW01', 'BR-GANET', 'FAC-SWITCH', 'Nintendo Switch 01', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-SW02', 'BR-GANET', 'FAC-SWITCH', 'Nintendo Switch 02', 'AVAILABLE', 'GOOD', 'DRAFT'),
('GN-VR01', 'BR-GANET', 'FAC-PSVR2', 'PSVR2 01', 'AVAILABLE', 'GOOD', 'DRAFT')
ON CONFLICT (unit_id) DO UPDATE SET
branch_id = EXCLUDED.branch_id,
facility_type_id = EXCLUDED.facility_type_id,
name = EXCLUDED.name,
status = EXCLUDED.status,
condition = EXCLUDED.condition,
data_status = EXCLUDED.data_status;

INSERT INTO pricing_rules (pricing_id, branch_id, facility_type_id, pricing_type, duration_minutes, price, source_date, data_status)
VALUES
('PRICE-B5-REG-1H', 'BR-B5', 'FAC-REGULAR', 'HOURLY', 60, 15000, '2025-01-24', 'SOURCE'),
('PRICE-B5-REG-3H', 'BR-B5', 'FAC-REGULAR', 'PACKAGE', 180, 40000, '2025-01-24', 'SOURCE'),
('PRICE-B5-CAP-1H', 'BR-B5', 'FAC-CAPSULE', 'HOURLY', 60, 15000, '2025-01-24', 'SOURCE'),
('PRICE-B5-CAP-3H', 'BR-B5', 'FAC-CAPSULE', 'PACKAGE', 180, 40000, '2025-01-24', 'SOURCE'),
('PRICE-B5-STEER-1H', 'BR-B5', 'FAC-STEERING', 'HOURLY', 60, 15000, '2025-01-24', 'SOURCE'),
('PRICE-B5-STEER-3H', 'BR-B5', 'FAC-STEERING', 'PACKAGE', 180, 40000, '2025-01-24', 'SOURCE'),
('PRICE-GN-REG-1H', 'BR-GANET', 'FAC-REGULAR', 'HOURLY', 60, 15000, '2025-02-05', 'SOURCE'),
('PRICE-GN-REG-3H', 'BR-GANET', 'FAC-REGULAR', 'PACKAGE', 180, 40000, '2025-02-05', 'SOURCE'),
('PRICE-GN-CAP-1H', 'BR-GANET', 'FAC-CAPSULE', 'HOURLY', 60, 20000, '2025-02-05', 'SOURCE'),
('PRICE-GN-CAP-3H', 'BR-GANET', 'FAC-CAPSULE', 'PACKAGE', 180, 50000, '2025-02-05', 'SOURCE'),
('PRICE-GN-VIP-1H', 'BR-GANET', 'FAC-VIP', 'HOURLY', 60, 35000, '2025-02-05', 'SOURCE'),
('PRICE-GN-VIP-2H', 'BR-GANET', 'FAC-VIP', 'PACKAGE', 120, 60000, '2025-02-05', 'SOURCE'),
('PRICE-GN-VIP-4H', 'BR-GANET', 'FAC-VIP', 'PACKAGE', 240, 110000, '2025-02-05', 'SOURCE'),
('PRICE-GN-VIP-6H', 'BR-GANET', 'FAC-VIP', 'PACKAGE', 360, 160000, '2025-02-05', 'SOURCE'),
('PRICE-GN-VVIP-1H', 'BR-GANET', 'FAC-VVIP', 'HOURLY', 60, 60000, '2025-02-05', 'SOURCE'),
('PRICE-GN-VVIP-2H', 'BR-GANET', 'FAC-VVIP', 'PACKAGE', 120, 110000, '2025-02-05', 'SOURCE'),
('PRICE-GN-VVIP-4H', 'BR-GANET', 'FAC-VVIP', 'PACKAGE', 240, 210000, '2025-02-05', 'SOURCE'),
('PRICE-GN-VVIP-6H', 'BR-GANET', 'FAC-VVIP', 'PACKAGE', 360, 288000, '2025-02-05', 'SOURCE'),
('PRICE-B5-VIP-1H-DRAFT', 'BR-B5', 'FAC-VIP', 'HOURLY', 60, 35000, NULL, 'DRAFT'),
('PRICE-B5-VVIP-1H-DRAFT', 'BR-B5', 'FAC-VVIP', 'HOURLY', 60, 60000, NULL, 'DRAFT'),
('PRICE-B5-SW-1H-DRAFT', 'BR-B5', 'FAC-SWITCH', 'HOURLY', 60, 20000, NULL, 'DRAFT'),
('PRICE-B5-VR-1H-DRAFT', 'BR-B5', 'FAC-PSVR2', 'HOURLY', 60, 35000, NULL, 'DRAFT'),
('PRICE-GN-STEER-1H-DRAFT', 'BR-GANET', 'FAC-STEERING', 'HOURLY', 60, 20000, NULL, 'DRAFT'),
('PRICE-GN-VR-1H-DRAFT', 'BR-GANET', 'FAC-PSVR2', 'HOURLY', 60, 35000, NULL, 'DRAFT')
ON CONFLICT (pricing_id) DO UPDATE SET
branch_id = EXCLUDED.branch_id,
facility_type_id = EXCLUDED.facility_type_id,
pricing_type = EXCLUDED.pricing_type,
duration_minutes = EXCLUDED.duration_minutes,
price = EXCLUDED.price,
source_date = EXCLUDED.source_date,
data_status = EXCLUDED.data_status;

INSERT INTO promotions (promotion_id, branch_id, name, description, status, source_date)
VALUES
('PROMO-MANTAI-GANET', 'BR-GANET', 'Paket Mantai', 'Paket VIP & VVIP', 'DRAFT', '2025-02-05')
ON CONFLICT (promotion_id) DO UPDATE SET
branch_id = EXCLUDED.branch_id,
name = EXCLUDED.name,
description = EXCLUDED.description,
status = EXCLUDED.status,
source_date = EXCLUDED.source_date;

INSERT INTO promotion_items (promotion_id, facility_type_id, duration_minutes, price)
VALUES
('PROMO-MANTAI-GANET', 'FAC-VIP', 120, 60000),
('PROMO-MANTAI-GANET', 'FAC-VIP', 240, 110000),
('PROMO-MANTAI-GANET', 'FAC-VIP', 360, 160000),
('PROMO-MANTAI-GANET', 'FAC-VVIP', 120, 110000),
('PROMO-MANTAI-GANET', 'FAC-VVIP', 240, 210000),
('PROMO-MANTAI-GANET', 'FAC-VVIP', 360, 288000)
ON CONFLICT (promotion_id) DO UPDATE SET
facility_type_id = EXCLUDED.facility_type_id,
duration_minutes = EXCLUDED.duration_minutes,
price = EXCLUDED.price;

INSERT INTO games (game_id, name, slug, description, short_description, developer, publisher, release_date, age_rating, research_status, active, data_status)
VALUES
('GM-001', 'A Way Out', 'a-way-out', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-002', 'Black Myth: Wukong', 'black-myth-wukong', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-003', 'Tekken 8', 'tekken-8', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-004', 'EA Sports FC 25', 'ea-sports-fc-25', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-005', 'Marvel Rivals', 'marvel-rivals', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-006', 'Rabbids Party of Legends', 'rabbids-party-of-legends', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-007', 'Crash Team Racing Nitro-Fueled', 'crash-team-racing-nitro-fueled', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-008', 'Dragon Ball: Sparking! ZERO', 'dragon-ball-sparking-zero', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-009', 'Cat Quest II', 'cat-quest-ii', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-010', 'Overcooked! All You Can Eat', 'overcooked-all-you-can-eat', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-011', 'NBA 2K25', 'nba-2k25', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-012', 'eFootball 2024', 'efootball-2024', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-013', 'Assassin''s Creed Valhalla', 'assassins-creed-valhalla', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-014', 'RIDE 5', 'ride-5', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-015', 'It Takes Two', 'it-takes-two', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-016', 'Tennis World Tour 2', 'tennis-world-tour-2', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-017', 'Disney Speedstorm', 'disney-speedstorm', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-018', 'Alienation', 'alienation', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-019', 'Grand Theft Auto V', 'grand-theft-auto-v', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-020', 'Dead Space', 'dead-space', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-021', 'One Piece Odyssey', 'one-piece-odyssey', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-022', 'UFC 5', 'ufc-5', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-023', 'Watch Dogs 2', 'watch-dogs-2', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-024', 'Ghostwire: Tokyo', 'ghostwire-tokyo', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-025', 'Battlefield 1', 'battlefield-1', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-026', 'Helldivers 2', 'helldivers-2', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-027', 'Gran Turismo 7', 'gran-turismo-7', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-028', 'MotoGP 24', 'motogp-24', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-029', 'Street Fighter 6', 'street-fighter-6', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-030', 'Marvel''s Spider-Man 2', 'marvels-spider-man-2', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-031', 'Elden Ring', 'elden-ring', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-032', 'F1 23', 'f1-23', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-033', 'Unravel Two', 'unravel-two', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-034', 'Maneater', 'maneater', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-035', 'Undisputed', 'undisputed', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-036', 'Naruto Shippuden: Ultimate Ninja Storm 4', 'naruto-shippuden-ultimate-ninja-storm-4', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-037', 'Call of Duty: Black Ops III', 'call-of-duty-black-ops-iii', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-038', 'LEGO Jurassic World', 'lego-jurassic-world', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-039', 'OddBallers', 'oddballers', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-040', 'Alan Wake II', 'alan-wake-ii', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-041', 'Call of Duty: Black Ops 6', 'call-of-duty-black-ops-6', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-042', 'Brothers: A Tale of Two Sons', 'brothers-a-tale-of-two-sons', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-043', 'Garfield Lasagna Party', 'garfield-lasagna-party', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-044', 'Little Nightmares', 'little-nightmares', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-045', 'PICO PARK', 'pico-park', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-046', 'Riders Republic', 'riders-republic', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-047', 'Road 96', 'road-96', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-048', 'Unknown 9: Awakening', 'unknown-9-awakening', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-049', 'Overpass 2', 'overpass-2', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-050', 'Mario Kart 8 Deluxe', 'mario-kart-8-deluxe', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-051', 'Kirby''s Return to Dream Land Deluxe', 'kirbys-return-to-dream-land-deluxe', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-052', 'Teenage Mutant Ninja Turtles: Shredder''s Revenge', 'teenage-mutant-ninja-turtles-shredders-revenge', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-053', 'ARMS', 'arms', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-054', 'Just Dance 2022', 'just-dance-2022', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-055', 'Mario Tennis Aces', 'mario-tennis-aces', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-056', 'The House of the Dead: Remake', 'the-house-of-the-dead-remake', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-057', 'Mario Party Superstars', 'mario-party-superstars', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE'),
('GM-058', 'Captain Tsubasa: Rise of New Champions', 'captain-tsubasa-rise-of-new-champions', NULL, NULL, NULL, NULL, NULL, NULL, 'RESEARCH_REQUIRED', TRUE, 'SOURCE')
ON CONFLICT (game_id) DO UPDATE SET
name = EXCLUDED.name,
slug = EXCLUDED.slug,
description = EXCLUDED.description,
short_description = EXCLUDED.short_description,
developer = EXCLUDED.developer,
publisher = EXCLUDED.publisher,
release_date = EXCLUDED.release_date,
age_rating = EXCLUDED.age_rating,
research_status = EXCLUDED.research_status,
active = EXCLUDED.active,
data_status = EXCLUDED.data_status;

INSERT INTO game_platforms (game_platform_id, game_id, platform_id, version, verification_status)
VALUES
('GP-001', 'GM-001', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-002', 'GM-002', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-003', 'GM-003', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-004', 'GM-004', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-005', 'GM-005', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-006', 'GM-006', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-007', 'GM-007', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-008', 'GM-008', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-009', 'GM-009', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-010', 'GM-010', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-011', 'GM-011', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-012', 'GM-012', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-013', 'GM-013', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-014', 'GM-014', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-015', 'GM-015', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-016', 'GM-016', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-017', 'GM-017', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-018', 'GM-018', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-019', 'GM-019', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-020', 'GM-020', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-021', 'GM-021', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-022', 'GM-022', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-023', 'GM-023', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-024', 'GM-024', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-025', 'GM-025', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-026', 'GM-026', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-027', 'GM-027', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-028', 'GM-028', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-029', 'GM-029', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-030', 'GM-030', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-031', 'GM-031', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-032', 'GM-032', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-033', 'GM-033', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-034', 'GM-034', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-035', 'GM-035', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-036', 'GM-036', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-037', 'GM-037', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-038', 'GM-038', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-039', 'GM-039', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-040', 'GM-040', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-041', 'GM-041', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-042', 'GM-042', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-043', 'GM-043', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-044', 'GM-044', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-045', 'GM-045', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-046', 'GM-046', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-047', 'GM-047', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-048', 'GM-048', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-049', 'GM-049', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-050', 'GM-050', 'PLAT-SWITCH', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-051', 'GM-051', 'PLAT-SWITCH', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-052', 'GM-052', 'PLAT-SWITCH', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-053', 'GM-053', 'PLAT-SWITCH', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-054', 'GM-054', 'PLAT-SWITCH', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-055', 'GM-055', 'PLAT-SWITCH', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-056', 'GM-056', 'PLAT-SWITCH', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-057', 'GM-057', 'PLAT-SWITCH', 'STANDARD', 'RESEARCH_REQUIRED'),
('GP-058', 'GM-058', 'PLAT-PS5', 'STANDARD', 'RESEARCH_REQUIRED')
ON CONFLICT (game_platform_id) DO UPDATE SET
game_id = EXCLUDED.game_id,
platform_id = EXCLUDED.platform_id,
version = EXCLUDED.version,
verification_status = EXCLUDED.verification_status;

INSERT INTO game_availability (game_availability_id, game_id, branch_id, available, condition, verification_status)
VALUES
('GA-001', 'GM-001', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-002', 'GM-001', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-003', 'GM-002', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-004', 'GM-002', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-005', 'GM-003', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-006', 'GM-003', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-007', 'GM-004', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-008', 'GM-005', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-009', 'GM-005', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-010', 'GM-006', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-011', 'GM-006', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-012', 'GM-007', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-013', 'GM-008', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-014', 'GM-009', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-015', 'GM-009', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-016', 'GM-010', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-017', 'GM-010', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-018', 'GM-011', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-019', 'GM-011', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-020', 'GM-012', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-021', 'GM-012', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-022', 'GM-013', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-023', 'GM-013', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-024', 'GM-014', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-025', 'GM-014', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-026', 'GM-015', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-027', 'GM-015', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-028', 'GM-016', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-029', 'GM-016', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-030', 'GM-017', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-031', 'GM-017', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-032', 'GM-018', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-033', 'GM-018', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-034', 'GM-019', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-035', 'GM-020', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-036', 'GM-021', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-037', 'GM-022', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-038', 'GM-023', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-039', 'GM-024', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-040', 'GM-024', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-041', 'GM-025', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-042', 'GM-026', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-043', 'GM-027', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-044', 'GM-028', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-045', 'GM-029', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-046', 'GM-030', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-047', 'GM-031', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-048', 'GM-032', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-049', 'GM-033', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-050', 'GM-034', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-051', 'GM-034', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-052', 'GM-035', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-053', 'GM-035', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-054', 'GM-036', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-055', 'GM-036', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-056', 'GM-037', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-057', 'GM-038', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-058', 'GM-039', 'BR-B5', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-059', 'GM-040', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-060', 'GM-041', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-061', 'GM-042', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-062', 'GM-043', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-063', 'GM-044', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-064', 'GM-045', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-065', 'GM-046', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-066', 'GM-047', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-067', 'GM-048', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-068', 'GM-049', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-069', 'GM-050', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-070', 'GM-051', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-071', 'GM-052', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-072', 'GM-053', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-073', 'GM-054', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-074', 'GM-055', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-075', 'GM-056', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-076', 'GM-057', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE'),
('GA-077', 'GM-058', 'BR-GANET', TRUE, 'AVAILABLE', 'SOURCE')
ON CONFLICT (game_availability_id) DO UPDATE SET
game_id = EXCLUDED.game_id,
branch_id = EXCLUDED.branch_id,
available = EXCLUDED.available,
condition = EXCLUDED.condition,
verification_status = EXCLUDED.verification_status;

INSERT INTO game_features (game_id, genre, local_multiplayer, online_multiplayer, co_op, competitive, single_player, max_local_players, recommended_players, psvr2, research_status)
VALUES
('GM-003', 'FIGHTING', TRUE, TRUE, FALSE, TRUE, TRUE, 2, 2, FALSE, 'PARTIAL'),
('GM-001', 'ADVENTURE/CO-OP', TRUE, TRUE, TRUE, FALSE, TRUE, 2, 2, FALSE, 'PARTIAL'),
('GM-010', 'PARTY/CO-OP', TRUE, TRUE, TRUE, FALSE, TRUE, 4, 4, FALSE, 'PARTIAL'),
('GM-057', 'PARTY', TRUE, TRUE, FALSE, TRUE, TRUE, 4, 4, FALSE, 'PARTIAL'),
('GM-050', 'RACING/PARTY', TRUE, TRUE, FALSE, TRUE, TRUE, 4, 4, FALSE, 'PARTIAL'),
('GM-015', 'ADVENTURE/CO-OP', TRUE, TRUE, TRUE, FALSE, TRUE, 2, 2, FALSE, 'PARTIAL')
ON CONFLICT (game_id) DO UPDATE SET
genre = EXCLUDED.genre,
local_multiplayer = EXCLUDED.local_multiplayer,
online_multiplayer = EXCLUDED.online_multiplayer,
co_op = EXCLUDED.co_op,
competitive = EXCLUDED.competitive,
single_player = EXCLUDED.single_player,
max_local_players = EXCLUDED.max_local_players,
recommended_players = EXCLUDED.recommended_players,
psvr2 = EXCLUDED.psvr2,
research_status = EXCLUDED.research_status;

INSERT INTO snacks (snack_id, name, category, price, stock, min_stock, active, data_status)
VALUES
('SNK-001', 'Popcorn', 'SNACK', 10000, 30, 10, TRUE, 'DRAFT'),
('SNK-002', 'Kentang Goreng', 'SNACK', 15000, 20, 5, TRUE, 'DRAFT'),
('SNK-003', 'Sosis Goreng', 'SNACK', 15000, 30, 10, TRUE, 'DRAFT'),
('SNK-004', 'Nugget', 'SNACK', 15000, 30, 10, TRUE, 'DRAFT'),
('SNK-005', 'Mie Instan', 'INSTANT_FOOD', 12000, 40, 10, TRUE, 'DRAFT'),
('SNK-006', 'Mie + Telur', 'INSTANT_FOOD', 17000, 30, 10, TRUE, 'DRAFT'),
('SNK-007', 'Roti Bakar', 'SNACK', 15000, 20, 5, TRUE, 'DRAFT'),
('SNK-008', 'Air Mineral', 'DRINK', 5000, 50, 15, TRUE, 'DRAFT'),
('SNK-009', 'Teh Botol', 'DRINK', 7000, 30, 10, TRUE, 'DRAFT'),
('SNK-010', 'Kopi', 'DRINK', 8000, 40, 10, TRUE, 'DRAFT'),
('SNK-011', 'Soda', 'DRINK', 10000, 30, 10, TRUE, 'DRAFT'),
('SNK-012', 'Paket Gamer', 'COMBO', 25000, 10, 3, TRUE, 'DRAFT')
ON CONFLICT (snack_id) DO UPDATE SET
name = EXCLUDED.name,
category = EXCLUDED.category,
price = EXCLUDED.price,
stock = EXCLUDED.stock,
min_stock = EXCLUDED.min_stock,
active = EXCLUDED.active,
data_status = EXCLUDED.data_status;

INSERT INTO booking_config (config_id, minimum_duration_minutes, maximum_duration_minutes, booking_interval_minutes, cleaning_duration_minutes, payment_deadline_minutes, extension_interval_minutes, minimum_extension_minutes, advance_booking_days, late_tolerance_minutes, data_status)
VALUES
('CFG-DEFAULT', 60, 360, 30, 10, 15, 30, 30, 30, 10, 'DRAFT')
ON CONFLICT (config_id) DO UPDATE SET
minimum_duration_minutes = EXCLUDED.minimum_duration_minutes,
maximum_duration_minutes = EXCLUDED.maximum_duration_minutes,
booking_interval_minutes = EXCLUDED.booking_interval_minutes,
cleaning_duration_minutes = EXCLUDED.cleaning_duration_minutes,
payment_deadline_minutes = EXCLUDED.payment_deadline_minutes,
extension_interval_minutes = EXCLUDED.extension_interval_minutes,
minimum_extension_minutes = EXCLUDED.minimum_extension_minutes,
advance_booking_days = EXCLUDED.advance_booking_days,
late_tolerance_minutes = EXCLUDED.late_tolerance_minutes,
data_status = EXCLUDED.data_status;

INSERT INTO data_sources (source_id, source_type, reference, source_date, verification_status)
VALUES
('SRC-IG-2025-01-24', 'INSTAGRAM_POST', 'Price list Batu 5', '2025-01-24', 'SOURCE_CONFIRMED'),
('SRC-IG-2025-02-05', 'INSTAGRAM_POST', 'Price list Ganet / Paket Mantai', '2025-02-05', 'SOURCE_CONFIRMED'),
('SRC-IG-GAMES', 'INSTAGRAM_POST', 'Game list Klub Sukaria / Ganet / Batu 5', '2025-01-2025', 'SOURCE_CONFIRMED'),
('SRC-MAPS-B5', 'GOOGLE_MAPS', 'Klub Sukaria Batu 5', NULL, 'SOURCE_PROVIDED_BY_USER'),
('SRC-MAPS-GANET', 'GOOGLE_MAPS', 'Sukaria Ganet', NULL, 'SOURCE_PROVIDED_BY_USER'),
('SRC-DRAFT-UNITS', 'INTERNAL_DRAFT', 'Provisional unit inventory', '2026-09-24', 'NEEDS_OWNER_CONFIRMATION'),
('SRC-DRAFT-SNACKS', 'INTERNAL_DRAFT', 'Provisional snack catalog', '2026-09-24', 'NEEDS_OWNER_CONFIRMATION')
ON CONFLICT (source_id) DO UPDATE SET
source_type = EXCLUDED.source_type,
reference = EXCLUDED.reference,
source_date = EXCLUDED.source_date,
verification_status = EXCLUDED.verification_status;

COMMIT;
