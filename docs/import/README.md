# Import đề từ JSON không gọi API AI

**Cách tính kết quả:** file v1 không đổi, không cần thêm trường mới. Sau Tạo bản nháp, admin chọn **Cách tính kết quả** trên web: THPT (đủ cấu trúc 12/4/6) hoặc chỉ thống kê số câu đúng. THPT dùng bảng điểm riêng thay cho points/scoring_mode trong file, không cần sửa từng câu. Các giá trị nguồn vẫn được giữ; xem [giới thiệu dự án](../../README.md#chức-năng-đã-triển-khai).

Admin vào **Bài kiểm tra → Import đề từ JSON**, chọn lớp, tải tệp, sửa/xem trước rồi bấm **Tạo bản nháp**. Không phải tích checkbox đối chiếu nội dung từng câu. Chưa bấm nút thì chưa tạo đề/câu hỏi trong database. Ảnh ZIP được tải vào Storage private để xem trước; bỏ dở có thể để lại ảnh, không tự xóa tài nguyên đang dùng. Thử lại dùng lại ảnh theo hash. Không cần `OPENAI_API_KEY`.

- [exam.schema.json](exam.schema.json): JSON Schema draft-07, định dạng `lop-minh-exam`, `version: 1`.
- [example.json](example.json): mẫu không hình, đủ ba loại; thêm câu văn bản để minh họa biến thể.
- [example-unlimited.json](example-unlimited.json): đủ ba loại, `duration_minutes: null`, nguồn AI được giữ nguyên và không cần checkbox xác nhận.
- [example-with-images.zip](example-with-images.zip): gói có ảnh, nguồn tại [example-with-images/exam.json](example-with-images/exam.json).
- [content-example.zip](content-example.zip): mẫu mới có văn bản đầy đủ A/B/C/D, bốn nhận định, trả lời ngắn, phân số/căn/tích phân/vectơ, bảng dữ liệu và hình đồ thị riêng. [JSON nguồn](content-example/exam.json).
- [PROMPT_CHATGPT.md](PROMPT_CHATGPT.md): gửi cùng PDF, schema và mẫu cho ChatGPT.

## Quy ước

Schema tiếp tục **version 1**: các trường mới `tables`, `images[].placement`, `images[].target_id` là tùy chọn. File version 1 hợp lệ trước đây không có các trường này vẫn nhập được; bảng mặc định rỗng và hình mặc định ở dưới. Không nhận nội dung chỉ có nhãn A/B/C/D hoặc “xem câu hỏi trong hình”. Nếu có tiền tố “A.”/“a)” trong text, bỏ tiền tố vì giao diện tự thêm nhãn, không tự sửa/đoán nội dung còn thiếu.

`tables` có thể đặt ở câu hoặc lựa chọn/nhận định: `{id,caption,headers:["Giá trị","Tần số"],rows:[["1","3"],["2","5"]]}`. Bảng tối đa 12 cột/100 hàng, mỗi hàng đủ số ô, mỗi ô là Unicode/LaTeX; form sửa từng ô, thêm/bỏ hàng/cột. Bảng hiển thị thành HTML table, có thể chọn/copy, cuộn ngang cục bộ nếu quá rộng. Không dùng ảnh chụp bảng thay bảng dữ liệu.

Hình chỉ là hình học/đồ thị/minh họa riêng, giữ đủ nhãn và trục, không chứa nguyên câu/trang/đáp án. `placement: "right"` đặt bên phải trên desktop với cột chữ đủ rộng; `"below"` đặt dưới. Trên điện thoại hình xuống dưới, bấm hình để phóng to. Hình của ý/lựa chọn có `target_id` tham chiếu đúng ID; không có trường này thì gắn nội dung chung. Giáo viên đổi vị trí và đối tượng của hình trong form. Không có hình thì không tạo ảnh thay thế. Server kiểm tra file và đường dẫn; không gọi OCR/AI để suy luận nội dung ảnh. Người chuẩn bị phải cắt đúng vùng theo hướng dẫn, không có lời hứa tự phát hiện mọi ảnh chụp nguyên câu.

Văn bản giữ xuống dòng; KaTeX hỗ trợ `$...$`, `$$...$$` và chuẩn hóa `\(...\)`/`\[...\]`. Server báo lỗi công thức thay vì lưu bản nhập không hợp lệ. Không chèn HTML thực thi. Mẫu minh họa có cả hệ phương trình, tập hợp và ký hiệu góc trong lời giải. Nội dung thiếu/không đọc được cần bổ sung từ tài liệu, không bịa hoặc thay bằng ảnh.

`exam` chứa tiêu đề, mô tả, hướng dẫn, `duration_minutes` (số nguyên 1–360 hoặc **null** khi không giới hạn thời gian). Không dùng 0, số lớn hoặc chuỗi "null" thay null. Không có thời lượng và giờ đóng thì deadline=null, không đếm ngược/tự nộp; có giờ đóng thì deadline là giờ đóng. Có thời lượng thì lấy hạn sớm hơn giữa bắt đầu + thời lượng và giờ đóng. `sections` luôn gồm I/II/III theo thứ tự; phần có thể rỗng nhưng tổng từ 1 đến 200 câu. Câu đánh số lại trong từng phần. File không quyết định lớp, quyền, lịch hoặc trạng thái công bố; admin chọn lớp trên website, đề luôn được tạo nháp. Schema vẫn version 1, mở rộng chấp nhận null và giữ tương thích số nguyên cũ.

`package_id` là UUID của gói. Giữ nguyên khi thử lại: server trả về cùng đề cho admin đó, **không ghi đè bằng tệp gửi lại**. Muốn nhập thành đề khác hãy tạo UUID gói mới. Sửa đề đã nhập ngay ở trang chỉnh sửa, kể cả đã có lượt làm: phiên bản mới giữ cùng link, lượt cũ dùng snapshot nội dung/đáp án/thang điểm lúc bắt đầu. Hai admin được tách theo tài khoản.

ID câu duy nhất trong gói, ID lựa chọn/nhận định duy nhất trong câu: 1–64 chữ/số/`_`/`-`, bắt đầu bằng chữ/số, không có `:`. ID nguồn câu được giữ trong metadata private qua chỉnh sửa/sao chép; UUID database nội bộ vẫn dùng cho câu/lượt làm. Cùng gói trả về cùng đề và UUID đã lưu. Lựa chọn giữ ID nguồn trong database; đáp án tham chiếu ID nên không đổi nghĩa khi đảo thứ tự. Không dùng chỉ số mảng.

| Loại            | Cấu trúc                                                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single`        | 2–8 `options`; `answer.choice_id` là ID lựa chọn hoặc `null` nếu chưa có đáp án.                                                                                                                                                         |
| `boolean_group` | Nội dung chung và đúng 4 `statements`; `answer.values` gồm `{statement_id, value: true/false}`, không lặp ID, thứ tự tùy ý. Có thể rỗng/chưa đủ để lưu nháp. `scoring_mode`: `per_statement` chia đều điểm theo ý hoặc `all_or_nothing`. |
| `short`         | `answer.mode` là `numeric`/`text`; `accepted` gồm các biến thể, rỗng nếu chưa có. `tolerance` là chuỗi sai số tuyệt đối không âm, mặc định ghi `"0"`; văn bản dùng `case_sensitive` và đặt tolerance `"0"`.                              |

Số dùng **chuỗi**, ví dụ `"-1,25"`, sai số `"0.01"`. Chuẩn hóa phẩy/chấm/khoảng trắng; không dùng phân số, biểu thức, ký hiệu khoa học hay so sánh đại số. Văn bản chuẩn hóa khoảng trắng như hệ thống cũ. `points` lớn hơn 0, tối đa 100 vẫn là trường bắt buộc của file v1. Chỉ cách chấm cũ dùng điểm gốc để quy đổi thang 10; khi admin chọn THPT trên web, quy tắc THPT thay thế points/scoring_mode nguồn. Counts không chấm điểm số.

`content` và `explanation` hỗ trợ LaTeX trong `$...$`/`$$...$$`; JSON phải escape gạch chéo ngược: `\frac` viết thành `"\\frac{1}{2}"`. Form cảnh báo lỗi công thức để giáo viên sửa.

## Nguồn và xác nhận đáp án

`answer.origin`: `document` (từ tài liệu), `ai` (AI giải), `teacher` (giáo viên nhập/sửa), `unconfirmed` (chưa rõ/chưa có). Nguồn không chứng minh đáp án đúng. **Không có trường confirmed trong tệp**: mọi đáp án đều chưa xác nhận sau khi tải vào.

Không phải chọn nguồn hoặc tích xác nhận từng câu. `answer.origin` lấy từ file và chỉ hiển thị như metadata; không tự đổi AI thành teacher/document. Trạng thái xác nhận cũ được giữ, không reset khi sửa và không tự gán giáo viên đã xác nhận. Đáp án đầy đủ/hợp lệ được công bố trực tiếp dù nguồn là AI hoặc unconfirmed. Được lưu nháp thiếu đáp án; cả server và RPC vẫn chặn công bố thiếu/sai đáp án, báo câu cần sửa. Dữ liệu cũ không bị gán trạng thái mới hay tính lại điểm.

Đáp án, lời giải, cấu hình số và nguồn/xác nhận nằm trong schema private. Chỉ RPC admin đọc khi soạn; payload làm bài không có các khóa này. Kết quả mở đáp án theo lịch hiện có. Không đính kèm hình chứa bảng đáp án cho học sinh.

## ZIP và hình

```text
de.zip
  exam.json
  images/
    parabola.png
```

Mỗi câu có `images: [{"path":"images/parabola.png","caption":"Đồ thị"}]`, tối đa 8 hình. Không hình dùng `images: []` và tải JSON riêng. Không nhận URL, data URL, đường dẫn tuyệt đối, `..`, SVG, PDF, script, symlink. Tên ảnh dùng chữ/số/`_`/`-`/`.`; thư mục con dùng chữ/số/`_`/`-`. Đường dẫn JSON dùng `/`; dấu `\` trong ZIP Windows được chuẩn hóa rồi kiểm tra traversal.

Upload tối đa **4 MB** (phù hợp hosting); JSON **1 MB**, ZIP **60 mục**, tổng giải nén/ảnh chuẩn hóa **20 MB**, mỗi ảnh **3 MB**, **20 triệu pixel**. Server kiểm tra cả ảnh không tham chiếu, định dạng thực, decode; không nhận nhiều khung. Ảnh chuẩn hóa JPEG/bỏ metadata rồi lưu bucket private `classroom`. Không giải nén ra filesystem hoặc tải ảnh qua URL. Thiếu/sai ảnh báo ID câu trước khi tạo đề. ZIP chỉ có exam.json và images/. Tối đa 20 đề JSON mới/admin/giờ; thử lại gói có sẵn không tạo thêm đề.

Nén nội dung thư mục, không thêm thư mục ngoài:

```powershell
Compress-Archive -Path .\example-with-images\* -DestinationPath .\de.zip
```

## Bảo trì

Migration mới `011_question_content.sql` thêm bảng dạng văn bản; không sửa/chạy lại 001–010. ZIP dùng [yauzl](https://github.com/thejoshwolfe/yauzl) để đọc từng mục có giới hạn; xử lý ảnh dùng Sharp đã có. Không gọi AI. Schema/mẫu công khai ở `/import/exam.schema.json`, `/import/example.json`.

```powershell
npx.cmd tsx scripts/export-import-schema.ts
node scripts/create-import-example.mjs
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Schema tài liệu/công khai sinh từ cùng Zod schema server; test so sánh để tránh lệch. Server kiểm tra thêm ID trùng, tham chiếu đáp án, số/sai số và ảnh thực. PostgreSQL test kiểm tra nháp/xác nhận/công bố, nhập trùng, sao chép, bảo mật và chấm đủ ba loại. ZIP test gồm traversal, symlink, mục trùng, ảnh giả và giới hạn giải nén.
