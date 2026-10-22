# HCMC geocoding benchmark — results

Run: 2026-10-22 · 55 queries · 209 credits · reference = Wikidata P625 (independent of Geoapify/OSM geocoding).

Strategies: **search** = `/v1/geocode/search`, **autocomplete** = `/v1/geocode/autocomplete` (both `lang=vi`, `filter=countrycode:vn`, `bias=proximity:HCMC`, top-1), **sitescout** = `resolvePlace()` v1.0 (autocomplete-first chain with token-overlap check, `src/engine/scout.ts`), **sitescout_v11** = the same after this benchmark: pre-2025 units (`Phường 12`, `Quận 5`, `TP Thủ Đức`) are dropped from the query and the score, and tokens match as whole words (re-run the same day).

## Within tolerance of the reference point (300 m for buildings, 1.5 km for parks/airport/areas)

| Group | n | search | autocomplete | sitescout | sitescout_v11 |
|---|---|---|---|---|---|
| landmark-formal | 29 | 19/29 (66%) | 25/29 (86%) | 26/29 (90%) | 27/29 (93%) |
| informal-no-diacritics | 10 | 8/10 (80%) | 7/10 (70%) | 9/10 (90%) | 8/10 (80%) |
| address-old-ward | 8 | 4/8 (50%) | 3/8 (38%) | 2/8 (25%) | 6/8 (75%) |
| address-new-ward | 8 | 6/8 (75%) | 7/8 (88%) | 7/8 (88%) | 7/8 (88%) |
| ALL | 55 | 37/55 (67%) | 42/55 (76%) | 44/55 (80%) | 48/55 (87%) |

## Median distance to reference (found results only)

| Group | search | autocomplete | sitescout | sitescout_v11 |
|---|---|---|---|---|
| landmark-formal | 232 m | 22 m | 79 m | 22 m |
| informal-no-diacritics | 156 m | 120 m | 72 m | 94 m |
| address-old-ward | 435 m | 794 m | 1,681 m | 44 m |
| address-new-ward | 78 m | 44 m | 48 m | 34 m |

## Administrative labels (2025 reform: 2-tier city→ward, Thủ Đức city and districts abolished 1/7/2025)

| Check | search | autocomplete | sitescout | sitescout_v11 |
|---|---|---|---|---|
| 'Thủ Đức' in label for a place outside old Thủ Đức | 31/55 (56%) | 32/55 (58%) | 42/55 (76%) | 30/55 (55%) |
| label still contains a pre-2025 unit (Quận N, Phường N, Bến Nghé, …) | 31/55 (56%) | 32/55 (58%) | 43/55 (78%) | 30/55 (55%) |
| new-ward query → expected new ward named in result | 6/8 (75%) | 7/8 (88%) | 8/8 (100%) | 8/8 (100%) |

## Old vs new ward name for the same street address

| Address | old-ward query (sitescout v1.0) | old-ward query (v1.1) | new-ward query (v1.0) |
|---|---|---|---|
| 7 Công trường Lam Sơn (Nhà hát Thành phố Hồ Chí Minh) | 65 m ✓ | 65 m ✓ | 65 m ✓ |
| 2 Công xã Paris (Bưu điện Sài Gòn) | 5,477 m ✗ | 55 m ✓ | 92 m ✓ |
| 28 Võ Văn Tần (Bảo tàng Chứng tích chiến tranh) | 7,766 m ✗ | 34 m ✓ | 24 m ✓ |
| 289 Hai Bà Trưng (Nhà thờ Tân Định) | 9 m ✓ | 22 m ✓ | 22 m ✓ |
| 201B Nguyễn Chí Thanh (Bệnh viện Chợ Rẫy) | 1,038 m ✗ | 20,316 m ✗ | 57 m ✓ |
| 57A Tháp Mười (Chợ Bình Tây) | 2,120 m ✗ | 18 m ✓ | 39 m ✓ |
| 720A Điện Biên Phủ (Landmark 81) | 7,251 m ✗ | 29 m ✓ | 29 m ✓ |
| 1 Vũ Tùng (Lăng Ông (Bà Chiểu)) | 1,242 m ✗ | 434 m ✗ | 732 m ✗ |

## Every query

| id | query | search | autocomplete | sitescout | sitescout_v11 | sitescout label |
|---|---|---|---|---|---|---|
| lm-01 | Chợ Bến Thành, Thành phố Hồ Chí Minh | 4 m ✓ | 4 m ✓ | 139 m ✓ | 4 m ✓ | Chợ Bến Thành, Lê Lợi, Phường Bến Thành, Thành phố Thủ Đức, 71009, Việt Nam |
| lm-02 | Nhà thờ chính tòa Đức Bà Sài Gòn, Thành phố Hồ Chí Minh | 15 m ✓ | 15 m ✓ | 265 m ✓ | 15 m ✓ | Toà nhà 22 Gia Long, 22, Lý Tự Trọng, Phường Sài Gòn, Thành phố Hồ Chí Minh, 71006, Việt Nam |
| lm-03 | Dinh Độc Lập, Thành phố Hồ Chí Minh | 13 m ✓ | 13 m ✓ | 215 m ✓ | 13 m ✓ | Trưng bày Từ Dinh Norodom đến Dinh Độc Lập, 106, Nguyễn Du, Phường Bến Thành, Thành phố Thủ Đức, 71009, Việt Nam |
| lm-04 | Bưu điện Sài Gòn, Thành phố Hồ Chí Minh | 1,920 m ✗ | 7 m ✓ | 5 m ✓ | 7 m ✓ | Bưu điện Trung tâm Sài Gòn, 2, Công trường Công xã Paris, Phường Sài Gòn, Thành phố Thủ Đức, 71006, Việt Nam |
| lm-05 | Bitexco Financial Tower, Thành phố Hồ Chí Minh | 22 m ✓ | 22 m ✓ | 22 m ✓ | 22 m ✓ | Tháp Tài chính Bitexco, 02, Hải Triều, Phường Sài Gòn, Thành phố Hồ Chí Minh, 72806, Việt Nam |
| lm-06 | Landmark 81, Thành phố Hồ Chí Minh | 3,121 m ✗ | 10 m ✓ | 10 m ✓ | 10 m ✓ | Cửa Hàng Innisfree - Vincom Landmark 81, 720A, Điện Biên Phủ, Ho Chi Minh City, 700000, Vietnam |
| lm-07 | Sân bay quốc tế Tân Sơn Nhất, Thành phố Hồ Chí Minh | 1,316 m ✓ | 1,246 m ✓ | 1,668 m ✗ | 1,316 m ✓ | Hải quan cửa khẩu Sân bay quốc tế Tân Sơn Nhất, 51, Trường Sơn, Phường Tân Sơn Hòa, Thành phố Thủ Đức, HC 72215, Việt Nam |
| lm-08 | Thảo Cầm Viên Sài Gòn, Thành phố Hồ Chí Minh | 232 m ✓ | 232 m ✓ | 178 m ✓ | 232 m ✓ | Thảo Cầm Viên Sài Gòn, 2, Nguyễn Bỉnh Khiêm, Phường Sài Gòn, Thành phố Thủ Đức, 71006, Việt Nam |
| lm-09 | Chợ Bình Tây, Thành phố Hồ Chí Minh | 18 m ✓ | 18 m ✓ | 39 m ✓ | 18 m ✓ | Chợ Bình Tây, 57A, Đường Tháp Mười, Phường Bình Tây, Thành phố Thủ Đức, Hồ Chí Minh 73000, Việt Nam |
| lm-10 | Công viên Văn hóa Đầm Sen, Thành phố Hồ Chí Minh | 326 m ✓ | 7,027 m ✗ | 211 m ✓ | 211 m ✓ | Công viên Văn hóa Đầm Sen, Hẻm 48 Hòa Bình, Phường Bình Thới, Thành phố Thủ Đức, 72015, Việt Nam |
| lm-11 | Nhà hát Thành phố Hồ Chí Minh, Thành phố Hồ Chí Minh | 213 m ✓ | 109 m ✓ | 213 m ✓ | 27 m ✓ | Khuôn viên UBND Thành phố Hồ Chí Minh, Phường Sài Gòn, Thành phố Thủ Đức, Việt Nam |
| lm-12 | Bảo tàng Chứng tích chiến tranh, Thành phố Hồ Chí Minh | 5,315 m ✗ | 23 m ✓ | 34 m ✓ | 23 m ✓ | Bảo tàng Chứng tích Chiến tranh, 28, Võ Văn Tần, Phường Xuân Hòa, Thành phố Thủ Đức, 70001, Việt Nam |
| lm-13 | Chợ Bà Chiểu, Thành phố Hồ Chí Minh | 4,072 m ✗ | 27 m ✓ | 56 m ✓ | 27 m ✓ | Chợ Bà Chiểu, Phan Đăng Lưu, Phường Gia Định, Thành phố Thủ Đức, 72317, Việt Nam |
| lm-14 | Lăng Ông (Bà Chiểu), Thành phố Hồ Chí Minh | 1,868 m ✗ | 2,730 m ✗ | 8 m ✓ | 8 m ✓ | Lăng Ông Bà Chiểu, Phường Gia Định, Thành phố Thủ Đức, Việt Nam |
| lm-15 | Bến Nhà Rồng, Thành phố Hồ Chí Minh | 56 m ✓ | 14 m ✓ | 56 m ✓ | 14 m ✓ | Khu Di tích Bến Nhà Rồng, Phường Xóm Chiếu, Thành phố Thủ Đức, HC, Việt Nam |
| lm-16 | Chợ Tân Định, Thành phố Hồ Chí Minh | 2,923 m ✗ | 6 m ✓ | 108 m ✓ | 6 m ✓ | Chợ Tân Định, Hai Bà Trưng, Phường Xuân Hòa, Thành phố Thủ Đức, 72200, Việt Nam |
| lm-17 | Nhà thờ Tân Định, Thành phố Hồ Chí Minh | 4,321 m ✗ | 22 m ✓ | 9 m ✓ | 22 m ✓ | Nhà thờ Tân Định, 289, Hai Bà Trưng, Phường Xuân Hòa, Thành phố Thủ Đức, Hồ Chí Minh 72200, Việt Nam |
| lm-18 | Chùa Ngọc Hoàng, Thành phố Hồ Chí Minh | 18 m ✓ | 18 m ✓ | 18 m ✓ | 18 m ✓ | Jade Emperor Pagoda, 73, Mai Thi Luu Street, Phường Tân Định, Ho Chi Minh City, HC 72200, Vietnam |
| lm-19 | Hồ Con Rùa, Thành phố Hồ Chí Minh | 9 m ✓ | 9 m ✓ | 16 m ✓ | 9 m ✓ | Hồ Con Rùa, Công trường Quốc tế, Phường Xuân Hòa, Thành phố Thủ Đức, 71006, Việt Nam |
| lm-20 | Bệnh viện Chợ Rẫy, Thành phố Hồ Chí Minh | 57 m ✓ | 57 m ✓ | 57 m ✓ | 57 m ✓ | Bệnh viện Chợ Rẫy, 201B, Đường Nguyễn Chí Thanh, Phường Chợ Lớn, Ho Chi Minh City, Thành phố Hồ Chí Minh 72415, Vietnam |
| lm-21 | Sân vận động Thống Nhất, Thành phố Hồ Chí Minh | 3,532 m ✗ | 11 m ✓ | 13 m ✓ | 11 m ✓ | Sân vận động Thống Nhất, 138, Đào Duy Từ, Phường Diên Hồng, Thành phố Thủ Đức, Thành phố Hồ Chí Minh 72415, Việt Nam |
| lm-22 | Công viên Tao Đàn, Thành phố Hồ Chí Minh | 149 m ✓ | 27 m ✓ | 27 m ✓ | 27 m ✓ | Công viên Tao Đàn, Phường Bến Thành, Thành phố Thủ Đức, 71009, Việt Nam |
| lm-23 | Chợ An Đông, Thành phố Hồ Chí Minh | 1 m ✓ | 1 m ✓ | 162 m ✓ | 1 m ✓ | Chợ An Đông, An Dương Vương, Phường An Đông, Thành phố Thủ Đức, 72712, Việt Nam |
| lm-24 | Công viên Hoàng Văn Thụ, Thành phố Hồ Chí Minh | 21 m ✓ | 21 m ✓ | 79 m ✓ | 21 m ✓ | Công viên Hoàng Văn Thụ, Phường Tân Sơn Hòa, Thành phố Thủ Đức, Tân Sơn Hòa, Việt Nam |
| lm-25 | Cầu Thủ Thiêm, Thành phố Hồ Chí Minh | 37 m ✓ | 62 m ✓ | 455 m ✓ | 62 m ✓ | Cầu Thủ Thiêm, Phường Thạnh Mỹ Tây, Thành phố Thủ Đức, 71108, Việt Nam |
| lm-26 | Đường hầm sông Sài Gòn, Thành phố Hồ Chí Minh | 582 m ✓ | 645 m ✓ | 580 m ✓ | 645 m ✓ | Đường hầm sông Sài Gòn, Phường Sài Gòn, Thành phố Thủ Đức, 72806, Việt Nam |
| lm-27 | Saigon Centre, Thành phố Hồ Chí Minh | 1,111 m ✗ | 1,663 m ✗ | 401 m ✗ | 1,663 m ✗ | Toà Nhà Saigon Centre, 65, Lê Lợi, Phường Sài Gòn, Thành phố Thủ Đức, 71006, Việt Nam |
| lm-28 | Đại học Quốc gia Thành phố Hồ Chí Minh, Thành phố Hồ Chí Minh | 2,566 m ✗ | 4,096 m ✗ | 4,096 m ✗ | 4,096 m ✗ | Trường Phổ thông Năng khiếu, Đại học Quốc gia Thành phố Hồ Chí Minh, 153, Đường Nguyễn Chí Thanh, Phường Chợ Lớn, Thành phố Thủ Đức, 72415, Việt Nam |
| lm-29 | Chợ Lớn, Thành phố Hồ Chí Minh | 1,417 m ✓ | 168 m ✓ | 168 m ✓ | 168 m ✓ | Phường Chợ Lớn, Thành phố Hồ Chí Minh, Việt Nam |
| inf-30 | cho ben thanh | 139 m ✓ | 139 m ✓ | 139 m ✓ | 139 m ✓ | Chợ Bến Thành, Lê Lợi, Phường Bến Thành, Thành phố Thủ Đức, 71009, Việt Nam |
| inf-31 | nha tho duc ba | 54 m ✓ | 54 m ✓ | 54 m ✓ | 54 m ✓ | Nhà thờ Đức Bà, Công trường Công xã Paris, Phường Sài Gòn, Thành phố Thủ Đức, 71006, Việt Nam |
| inf-32 | dinh doc lap | 189 m ✓ | 215 m ✓ | 215 m ✓ | 215 m ✓ | Trưng bày Từ Dinh Norodom đến Dinh Độc Lập, 106, Nguyễn Du, Phường Bến Thành, Thành phố Thủ Đức, 71009, Việt Nam |
| inf-33 | buu dien thanh pho | 174,666 m ✗ | 100 m ✓ | 100 m ✓ | 100 m ✓ | Bưu điện Thành phố, Hai Bà Trưng, Phường Sài Gòn, Thành phố Thủ Đức, HC 71006, Việt Nam |
| inf-34 | landmark 81 | 3,723 m ✗ | 10 m ✓ | 10 m ✓ | 10 m ✓ | Cửa Hàng Innisfree - Vincom Landmark 81, 720A, Điện Biên Phủ, Ho Chi Minh City, 700000, Vietnam |
| inf-35 | thao cam vien | 173 m ✓ | 88 m ✓ | 88 m ✓ | 88 m ✓ | Phòng Bán Vé Thảo Cầm Viên, Nguyễn Bỉnh Khiêm, Phường Sài Gòn, Thành phố Thủ Đức, HC 71006, Việt Nam |
| inf-36 | cho binh tay | 39 m ✓ | 7,782 m ✗ | 39 m ✓ | 7,782 m ✗ | Chợ Bình Tây, 57A, Đường Tháp Mười, Phường Bình Tây, Thành phố Thủ Đức, Hồ Chí Minh 73000, Việt Nam |
| inf-37 | san bay tan son nhat | 873 m ✓ | 1,694 m ✗ | 1,694 m ✗ | 1,694 m ✗ | Cầu vượt Sân bay Tân Sơn Nhất, Phường Tân Sơn Hòa, Thành phố Thủ Đức, 72100, Việt Nam |
| inf-38 | cho ba chieu | 56 m ✓ | 3,619 m ✗ | 56 m ✓ | 56 m ✓ | Chợ Bà Chiểu, Phan Đăng Lưu, Phường Gia Định, Thành phố Thủ Đức, 72317, Việt Nam |
| inf-39 | ho con rua | 9 m ✓ | 9 m ✓ | 16 m ✓ | 16 m ✓ | Hồ Con Rùa, Công trường Quốc tế, Phường Xuân Hòa, Thành phố Thủ Đức, 71006, Việt Nam |
| adr-40 | 7 Công trường Lam Sơn, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh | 65 m ✓ | 65 m ✓ | 65 m ✓ | 65 m ✓ | Nhà hát Thành phố, 7, Công trường Lam Sơn, Phường Sài Gòn, Thành phố Hồ Chí Minh, 71006, Việt Nam |
| adr-41 | 7 Công trường Lam Sơn, Phường Sài Gòn, Thành phố Hồ Chí Minh | 65 m ✓ | 65 m ✓ | 65 m ✓ | 65 m ✓ | Nhà hát Thành phố, 7, Công trường Lam Sơn, Phường Sài Gòn, Thành phố Hồ Chí Minh, 71006, Việt Nam |
| adr-42 | 2 Công xã Paris, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh | 5,465 m ✗ | 1,908 m ✗ | 5,477 m ✗ | 55 m ✓ | 713, Lạc Long Quân, Phường Bảy Hiền, Thành phố Thủ Đức, HC 72117, Việt Nam |
| adr-43 | 2 Công xã Paris, Phường Sài Gòn, Thành phố Hồ Chí Minh | 92 m ✓ | 55 m ✓ | 92 m ✓ | 5 m ✓ | Công trường Công xã Paris, Phường Sài Gòn, Thành phố Thủ Đức, 71006, Việt Nam |
| adr-44 | 28 Võ Văn Tần, Phường Võ Thị Sáu, Quận 3, Thành phố Hồ Chí Minh | 805 m ✗ | 551 m ✗ | 7,766 m ✗ | 34 m ✓ | Trường Tiểu học Võ Thị Sáu, 343, Văn Cao, Phường Phú Thạnh, Thuận An, 72031, Việt Nam |
| adr-45 | 28 Võ Văn Tần, Phường Xuân Hòa, Thành phố Hồ Chí Minh | 34 m ✓ | 34 m ✓ | 24 m ✓ | 24 m ✓ | 28, Võ Văn Tần, Phường Xuân Hòa, Thành phố Thủ Đức, 71009, Việt Nam |
| adr-46 | 289 Hai Bà Trưng, Phường 8, Quận 3, Thành phố Hồ Chí Minh | 9 m ✓ | 9 m ✓ | 9 m ✓ | 22 m ✓ | Nhà thờ Tân Định, 289, Hai Bà Trưng, Phường Xuân Hòa, Thành phố Thủ Đức, 72200, Việt Nam |
| adr-47 | 289 Hai Bà Trưng, Phường Xuân Hòa, Thành phố Hồ Chí Minh | 9 m ✓ | 9 m ✓ | 22 m ✓ | 22 m ✓ | 289, Hai Bà Trưng, Phường Xuân Hòa, Thành phố Thủ Đức, 72200, Việt Nam |
| adr-48 | 201B Nguyễn Chí Thanh, Phường 12, Quận 5, Thành phố Hồ Chí Minh | 57 m ✓ | 1,038 m ✗ | 1,038 m ✗ | 20,316 m ✗ | 175/12, Đường Nguyễn Tri Phương, Phường An Đông, Thành phố Thủ Đức, HC 73000, Việt Nam |
| adr-49 | 201B Nguyễn Chí Thanh, Phường Chợ Lớn, Thành phố Hồ Chí Minh | 4,561 m ✗ | 57 m ✓ | 57 m ✓ | 57 m ✓ | Bệnh viện Chợ Rẫy, 201B, Đường Nguyễn Chí Thanh, Phường Chợ Lớn, Thành phố Thủ Đức, 72415, Việt Nam |
| adr-50 | 57A Tháp Mười, Phường 2, Quận 6, Thành phố Hồ Chí Minh | 18 m ✓ | 39 m ✓ | 2,120 m ✗ | 18 m ✓ | 175/2, Đường Nguyễn Tri Phương, Phường An Đông, Thành phố Thủ Đức, HC 73000, Việt Nam |
| adr-51 | 57A Tháp Mười, Phường Bình Tây, Thành phố Hồ Chí Minh | 244 m ✓ | 18 m ✓ | 39 m ✓ | 39 m ✓ | Chợ Bình Tây, 57A, Đường Tháp Mười, Phường Bình Tây, Thành phố Thủ Đức, 73000, Việt Nam |
| adr-52 | 720A Điện Biên Phủ, Phường 22, Quận Bình Thạnh, Thành phố Hồ Chí Minh | 7,251 m ✗ | 3,576 m ✗ | 7,251 m ✗ | 29 m ✓ | 149/22, Đường Nguyễn Tri Phương, Phường An Đông, Thành phố Thủ Đức, HC 73000, Việt Nam |
| adr-53 | 720A Điện Biên Phủ, Phường Thạnh Mỹ Tây, Thành phố Hồ Chí Minh | 29 m ✓ | 29 m ✓ | 29 m ✓ | 29 m ✓ | Vincom Center, 720A, Điện Biên Phủ, Phường Thạnh Mỹ Tây, Thành phố Thủ Đức, 71108, Việt Nam |
| adr-54 | 1 Vũ Tùng, Phường 1, Quận Bình Thạnh, Thành phố Hồ Chí Minh | 1,242 m ✗ | 4,063 m ✗ | 1,242 m ✗ | 434 m ✗ | 1, Đường Hoa Phượng, Phường Cầu Kiệu, Thành phố Thủ Đức, HC 72212, Việt Nam |
| adr-55 | 1 Vũ Tùng, Phường Gia Định, Thành phố Hồ Chí Minh | 3,795 m ✗ | 646 m ✗ | 732 m ✗ | 732 m ✗ | Lô A1, Vũ Huy Tấn, Phường Gia Định, Thành phố Thủ Đức, Hồ Chí Minh 72200, Việt Nam |
