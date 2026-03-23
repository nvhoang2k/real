# AI RealEstate PRO MAX V3

Plugin UXP cho Adobe Photoshop de tang cuong anh bat dong san theo luong lam viec khong pha huy.

## Diem da sua

- Bo kien truc Electron cu vi khong the nhung truc tiep vao Photoshop.
- Chuyen sang plugin UXP panel cho Photoshop.
- Xu ly pixel truc tiep tren document dang mo bang Imaging API.
- Tao layer ket qua moi thay vi ghi de layer goc.
- Them phan tich anh nhanh de goi y preset.
- Them export truc tiep ra JPG va TIFF tu plugin.
- Them `Performance mode` de tang toc xu ly anh lon.
- Them nhan dien do sang `Bright / Dark / Balanced` va tu dong pha muc chinh.
- Them `Batch One-Click` cho ca thu muc input/output va auto preset.
- Nang cap chat luong anh bang soft highlight recovery, shadow gamma, neutral balance va micro-contrast.
- Tach pipeline theo scene: `Living Room`, `Bedroom`, `Kitchen`, `Bathroom`, `Facade`, `Exterior Wide`.
- Them `Auto Enhance` mot nut duy nhat de tu chon preset, scene va adaptive enhancement.
- Toi uu workflow batch de bo qua file da ton tai va hien thi tom tat ket qua ro rang hon.
- Them `Protect Wall Color` de giu mau tuong pastel / be / xam am tot hon.
- Them `Wall Color Sensitivity` voi `Low / Medium / High`.
- Ghi nho dinh dang batch export sau khi da chon.
- Them progress bar cho batch, `Wall Compare`, `Protect Material Tone`, `White Cabinet Protection`, va dat ten file theo template.
- Nang cap scene classifier thanh `Living Room`, `Bedroom`, `Kitchen`, `Bathroom`, `Facade`, `Exterior Wide`.
- Bo sung kien truc `AI-ready` de sau nay co the gan model that ma khong pha vo workflow hien tai.
- Sua ten preset `luxury.json` va loai bo phan ONNX placeholder khong on dinh.

## Cai vao Photoshop

1. Mo **UXP Developer Tool**.
2. Chon **Add Plugin**.
3. Tro toi file [manifest.json](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\manifest.json).
4. Mo Photoshop va hien panel `AI RealEstate PRO MAX`.

## Cach dung

1. Mo anh RGB trong Photoshop.
2. Chon preset trong panel.
3. Nhan **Analyze Active Document** de xem thong so sang toi.
4. Chon `Performance mode` phu hop voi kich thuoc anh.
5. Bat `Tu dong nhan biet anh sang, toi, trung binh` neu muon plugin tu pha thong so.
6. Bat `Tu dong nhan biet interior, exterior, bathroom/kitchen` neu muon plugin doi pipeline theo ngu canh.
7. Bat `Protect Wall Color` neu muon giu mau tuong co mau tot hon.
8. Chon `Wall Color Sensitivity` de dieu chinh muc do bao ve mau tuong.
9. Bat `Protect Material Tone` va `White Cabinet Protection` neu muon uu tien giu chat lieu va cac be mat trang sang.
10. Nhan **Apply Preset** de tao mot layer ket qua moi.
11. Nhan **Wall Compare** de tao 2 layer so sanh wall color `Medium` va `High`.
12. Nhan **Export JPG** hoac **Export TIFF** de luu ban sao ra file.
13. Hoac dung **Batch One-Click** de chay ca thu muc anh voi auto preset.
14. Chinh `Batch file name template` neu muon quy uoc ten file xuat.
15. Hoac nhan **Auto Enhance** de plugin tu chon toan bo va tao layer ket qua bang mot nut.

## Luu y

- Plugin hien toi uu cho anh RGB 8-bit.
- Plugin khong can network va khong sua layer goc.
- Neu document qua lon, thoi gian xu ly se tang theo so pixel.
- `Auto` se tu giam do phan giai xu ly khi anh rat lon, sau do scale layer ket qua len lai bang noi suy cua Photoshop de tang toc.
- Plugin se phan loai anh thanh `Bright`, `Dark`, hoac `Balanced` dua tren average light, highlight ratio va shadow ratio.
- Plugin se phan loai scene thanh `Living Room`, `Bedroom`, `Kitchen`, `Bathroom`, `Facade`, hoac `Exterior Wide` de ap pipeline phu hop hon.
- Export JPG dung DOM `saveAs`; export TIFF dung `batchPlay` vi DOM `saveAs` chua expose TIFF trong tai lieu Adobe.
- Batch se mo tung file trong folder, phan tich, tu chon preset, export sang output folder, sau do dong file khong luu.
- Batch co the bo qua file da ton tai trong output folder de tranh export lai khong can thiet.
- Plugin co ghi nho lua chon `JPG/TIFF` cho batch; `input/output folder` se duoc chon lai moi lan de tranh nham duong dan.
- Batch hien thi progress bar va cho phep dat ten file theo template `{name}_{scene}_{preset}_{exposure}.{format}`.
- Chat luong anh da duoc toi uu de giam chay sang, giu chi tiet vung toi va can bang mau trung tinh tot hon cho khong gian noi that.
- `Protect Wall Color` giam luc trung tinh hoa o cac vung phang, it bao hoa, giup giu mau tuong nhat la cac tong pastel va be.
- `Low` giu can bang mau tuong nhe, `Medium` la mac dinh, `High` uu tien giu mau tuong toi da.
- `Protect Material Tone` giup giu chat lieu go, da, gach va cac be mat noi that co sac do tu nhien hon.
- `White Cabinet Protection` giup giu he tu, mat da sang va be mat trang sach hon, it nga xam.

## AI-ready architecture

- File [ai_runtime.js](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\ai_runtime.js) la adapter layer danh rieng cho model runtime.
- File [ai_runtime_onnx_provider.js](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\ai_runtime_onnx_provider.js) la provider mau cho ONNX Runtime theo dung contract.
- Thu muc [models](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\models) chua bo model chot, label map, bootstrap provider va config fine-tune/export.
- Hien tai plugin dung `noop provider` de van chay on dinh ngay ca khi chua co model hoc may that.
- Runtime da co `model manifest`, `provider adapter`, `warmup/status` va hook region signal de sau nay noi classifier + segmenter ma khong doi UI workflow.
- Luong phan tich trong [index.js](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\index.js) da co hook de nhan `scene`, `exposure`, `preset`, region masks va cac muc do bao ve tu model.
- Provider ONNX mau hien da chay classifier that cho `scene/exposure`, decode `Fast-SCNN` thanh mask `window/wall/material/cabinet`, va noi cac mask nay vao pipeline xu ly pixel hien tai.
- Tai lieu ky thuat tom tat nam o [AI_READY_ARCHITECTURE.md](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\AI_READY_ARCHITECTURE.md).

## Model stack chot

- `MobileNetV3-Small` cho `scene classification`
- `MobileNetV3-Small` cho `exposure classification`
- `Fast-SCNN` cho `window/wall/material/cabinet segmentation`

Config fine-tune va export nam o:
- [mobilenetv3_scene_finetune.json](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\models\configs\mobilenetv3_scene_finetune.json)
- [mobilenetv3_exposure_finetune.json](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\models\configs\mobilenetv3_exposure_finetune.json)
- [fastscnn_regions_finetune.json](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\models\configs\fastscnn_regions_finetune.json)
- [onnx_export.json](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\models\configs\onnx_export.json)

Script export nam o:
- [export_models.py](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\scripts\export_models.py)
- [fastscnn_builder.py](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\scripts\fastscnn_builder.py)
- [scripts/README.md](C:\Users\Administrator\Documents\New project\AI-RealEstate-PRO-MAX-V3\scripts\README.md)
