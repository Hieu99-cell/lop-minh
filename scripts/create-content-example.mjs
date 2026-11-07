import fs from 'node:fs';
fs.mkdirSync('docs/import/content-example/images', { recursive: true });
const doc = JSON.parse(fs.readFileSync('docs/import/example.json', 'utf8'));
doc.package_id = '4761c3ef-a23a-4161-88dd-8e807d56e9f8';
doc.exam.title = 'Đề mẫu văn bản, LaTeX, bảng và hình riêng';
const [single] = doc.sections[0].questions;
single.content =
  'Giải phương trình $\\frac{x}{2}+\\sqrt{4}=3$ trên tập hợp $\\mathbb{R}$.\nChọn một đáp án đúng.';
single.options.forEach((o, i) => (o.text = `$x=${i + 1}$`));
single.explanation = 'Vì $\\sqrt{4}=2$ nên $\\frac{x}{2}=1$, suy ra $x=2$.';
const [group] = doc.sections[1].questions;
group.content =
  'Cho hàm số $f(x)=x^2$ và bảng giá trị dưới đây. Hình bên phải là đồ thị minh họa.\nTrong mặt phẳng tọa độ, đặt $\\overrightarrow{OA}=(1;2)$, $A(1;2)$. Xét bốn nhận định.';
group.tables = [
  {
    id: 'values',
    caption: 'Bảng giá trị của $f(x)=x^2$',
    headers: ['$x$', '$f(x)$'],
    rows: [
      ['$-1$', '$1$'],
      ['$0$', '$0$'],
      ['$1$', '$1$'],
    ],
  },
];
group.statements[2].text = '$f(-1)=1$ và $\\overrightarrow{OA}=(1;2)$.';
group.statements[3].text = 'Đồ thị không đi qua gốc tọa độ.';
group.images = [
  {
    path: 'images/parabola.png',
    caption: 'Đồ thị $y=x^2$ với trục tọa độ và gốc O.',
    placement: 'right',
  },
];
group.explanation =
  'Ta có $f^{\\prime}(x)=2x$, $f(0)=0$, $f(-1)=1$.\nMột ví dụ hệ phương trình có nghiệm $(1;2)$: $$\\begin{cases}x+y=3\\\\2x-y=0\\end{cases}$$\nCác ký hiệu: $\\widehat{AOB}$, $\\log_2 8=3$, $A \\in \\mathbb{R}^2$.';
doc.sections[2].questions[0].content = 'Tính $-\\frac{5}{4}+\\int_0^1 0\\,dx$. Nhập số thập phân.';
doc.sections[2].questions[0].explanation = 'Vì $\\int_0^1 0\\,dx=0$ nên kết quả là $-1{,}25$.';
fs.writeFileSync('docs/import/content-example/exam.json', JSON.stringify(doc, null, 2) + '\n');
fs.copyFileSync(
  'docs/import/example-with-images/images/parabola.png',
  'docs/import/content-example/images/parabola.png',
);
console.log(
  'Đã tạo mẫu nội dung đầy đủ: văn bản, phân số/căn/tích phân/vectơ, bảng và hình riêng.',
);
