import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { documentQuestions } from '../src/features/json-import/convert';
import { validateDocument } from '../src/features/json-import/schema';
const admin = '00000000-0000-4000-8000-000000000001';
const student = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const unverified = '00000000-0000-4000-8000-000000000004';
let db: PGlite;
let cid: string;
let eid: string;
let aid: string;
async function actor(id?: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
  if (id) await db.exec('set role authenticated');
}
async function one<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  return (await db.query<T>(sql, args)).rows[0];
}
const exam = (release = 'after_submit') => ({
  class_id: cid,
  title: 'Kiểm tra toán',
  description: '',
  instructions: '',
  status: 'published',
  duration_minutes: 30,
  opens_at: null,
  closes_at: null,
  max_attempts: 1,
  score_method: 'highest',
  shuffle_questions: true,
  shuffle_options: true,
  score_release: release,
  answer_release: release,
});
const questions = [
  {
    id: 'test1',
    position: 1,
    kind: 'multiple',
    content: 'Các số nguyên tố?',
    options: [
      { id: 'a', text: '2' },
      { id: 'b', text: '3' },
      { id: 'c', text: '4' },
    ],
    correct_ids: ['a', 'b'],
    points: 2,
    explanation: '2 và 3 là số nguyên tố.',
  },
  {
    id: 'test2',
    position: 2,
    kind: 'boolean',
    content: '1 + 1 = 2',
    options: [
      { id: 't', text: 'Đúng' },
      { id: 'f', text: 'Sai' },
    ],
    correct_ids: ['t'],
    points: 1,
    explanation: 'Đúng.',
  },
];
async function createExam(release = 'after_submit') {
  await actor(admin);
  return (
    await one<{ id: string }>('select public.save_exam($1::jsonb,$2::jsonb) id', [
      JSON.stringify(exam(release)),
      JSON.stringify(questions),
    ])
  ).id;
}
beforeAll(async () => {
  db = new PGlite();
  // Chỉ mô phỏng các bảng hệ thống Supabase; SQL nghiệp vụ chạy nguyên migration.
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
 grant usage on schema auth,storage to authenticated;grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 create schema extensions;
 create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$select decode(string_agg(md5(random()::text),''),'hex') from generate_series(1,ceil(n/16.0)::int)$$;`);
  for (const file of [
    '001_schema.sql',
    '002_authoring.sql',
    '003_attempts_grading.sql',
    '005_reports.sql',
    '006_question_types.sql',
    '007_image_imports.sql',
    '008_authoring_sections.sql',
    '009_pdf_and_statement_answers.sql',
    '010_json_import.sql',
    '011_question_content.sql',
    '012_student_images.sql',
    '013_report_pagination.sql',
    '014_report_limits.sql',
    '015_attempt_snapshots.sql',
    '016_edit_exam_versions.sql',
    '017_auth_sessions.sql',
    '018_exam_practice_modes.sql',
    '019_practice_report_options.sql',
    '020_result_methods.sql',
    '021_move_exam_class.sql',
    '022_exam_cards_review.sql',
  ]) {
    if (file === '006_question_types.sql')
      await db.exec(`
      insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000000055','legacy@example.com',now());
      insert into public.classes(id,name,school_year) values('00000000-0000-4000-8000-000000000056','Lớp dữ liệu cũ','2025');
      insert into public.exams(id,class_id,title,duration_minutes) values('00000000-0000-4000-8000-000000000057','00000000-0000-4000-8000-000000000056','Đề đúng sai cũ',30);
      insert into public.questions(id,exam_id,position,kind,content,options,points) values('00000000-0000-4000-8000-000000000058','00000000-0000-4000-8000-000000000057',1,'boolean','Nội dung cũ','[{"id":"yes","text":"Đúng"},{"id":"no","text":"Sai"}]',1);
      insert into private.answer_keys values('00000000-0000-4000-8000-000000000058','["yes"]','Lời giải cũ');
      insert into public.attempts(id,exam_id,user_id,deadline,status,submitted_at,question_order,option_order,answers) values('00000000-0000-4000-8000-000000000059','00000000-0000-4000-8000-000000000057','00000000-0000-4000-8000-000000000055',now(),'submitted',now(),'["00000000-0000-4000-8000-000000000058"]','{}','{"00000000-0000-4000-8000-000000000058":["yes"]}');
      insert into private.scores values('00000000-0000-4000-8000-000000000059',1,1,10,1,0,0);
    `);
    await db
      .exec(
        readFileSync(`supabase/migrations/${file}`, 'utf8').replace(
          'create extension if not exists pgcrypto with schema extensions;',
          '',
        ),
      )
      .catch((error) => {
        throw new Error(
          `${file}: ${error.message}; position=${error.position}; internal=${error.internalQuery}; context=${error.where}`,
        );
      });
  }
  await db.query(
    `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,'lconghieu0108@gmail.com',now(),'{}'),($2,'student@example.com',now(),'{"role":"admin"}'),($3,'other@example.com',now(),'{}'),($4,'unverified@example.com',null,'{}')`,
    [admin, student, other, unverified],
  );
  await actor(admin);
  cid = (
    await one<{ id: string }>(
      "insert into public.classes(name,school_year) values('Toán 12','2026–2027') returning id",
    )
  ).id;
  const invite = await one<{ r: { token: string } }>("select public.manage_invite($1,'create') r", [
    cid,
  ]);
  await actor(student);
  await db.query('select public.join_class($1)', [invite.r.token]);
  eid = await createExam();
});
afterAll(async () => {
  await db?.close();
});
describe('Kiểu kết quả THPT / chỉ thống kê', () => {
  const options = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id }));
  const fixture = () => [
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`,
      position: i + 1,
      section: 1,
      kind: 'single',
      content: `Trắc nghiệm ${i + 1}`,
      options: options.slice(0, 2),
      correct_ids: ['a'],
      points: 7.13,
      explanation: '$x=1$',
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `g${i}`,
      position: i + 13,
      section: 2,
      kind: 'boolean_group',
      content: `Nhóm ${i + 1}`,
      options,
      correct_ids: options.map((o) => o.id + ':true'),
      points: 9.99,
      scoring_mode: 'all_or_nothing',
      explanation: '',
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `n${i}`,
      position: i + 17,
      section: 3,
      kind: 'short',
      content: `Số ${i + 1}`,
      options: [],
      correct_ids: [],
      points: 3.33,
      short_answer: { mode: 'numeric', accepted: ['1'], tolerance: '0.01', case_sensitive: false },
    })),
  ];
  async function setup(method = 'thpt', release = 'after_submit', qs: unknown[] = fixture()) {
    await actor(admin);
    const id = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify({
          ...exam(release),
          answer_release: 'never',
          max_attempts: 20,
          result_method: method,
          practice_enabled: true,
          shuffle_questions: false,
          shuffle_options: false,
        }),
        JSON.stringify(qs),
      ])
    ).id;
    await actor(student);
    return id;
  }
  async function start(id: string, mode = 'exam') {
    return (await one<{ id: string }>('select public.start_mode_attempt($1,$2) id', [id, mode])).id;
  }
  async function data(a: string) {
    return (
      await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [a])
    ).r;
  }
  async function result(a: string) {
    return (
      await one<{ r: import('../src/types').Result }>('select public.attempt_result($1) r', [a])
    ).r;
  }
  async function answers(a: string, n1: number, groups: number[], n3: number, practice = false) {
    const d = await data(a);
    for (const q of d.questions) {
      const part = q.section!;
      const index = d.questions.filter((x) => x.section === part).findIndex((x) => x.id === q.id);
      const selected =
        part === 1
          ? [index < n1 ? 'a' : 'b']
          : part === 2
            ? options.map((o, i) => o.id + (i < (groups[index] || 0) ? ':true' : ':false'))
            : [index < n3 ? ' 1,005 ' : '2'];
      if (practice)
        await db.query('select public.check_practice_question($1,$2,$3,$4)', [
          a,
          q.id,
          JSON.stringify(selected),
          crypto.randomUUID(),
        ]);
      else
        await db.query('select public.save_answer($1,$2,$3,false)', [
          a,
          q.id,
          JSON.stringify(selected),
        ]);
    }
  }
  test('bảng 0/1/2/3/4 ý dùng cent chính xác và tính riêng từng nhóm', async () => {
    await actor();
    for (let n = 0; n <= 4; n++)
      expect(
        (
          await one<{ v: number }>(
            "select private.question_result_cents($1,$2,private.result_policy('thpt')) v",
            [
              JSON.stringify(fixture()[12]),
              JSON.stringify(options.slice(0, n).map((o) => o.id + ':true')),
            ],
          )
        ).v,
      ).toBe([0, 10, 25, 50, 100][n]);
    const e = await setup();
    for (const [counts, expected] of [
      [[4, 0, 0, 0], 1],
      [[2, 2, 0, 0], 0.5],
    ] as const) {
      const a = await start(e);
      await answers(a, 0, [...counts], 0);
      await db.query('select public.submit_attempt($1)', [a]);
      expect(Number((await result(a)).score?.score)).toBe(expected);
    }
  });
  test('đúng tất cả =10; ví dụ 8 + (1,2,3,4) +4 =5,85; không chia/chuẩn hóa lại, không dùng points import', async () => {
    const e = await setup();
    for (const [n1, groups, n3, expected] of [
      [12, [4, 4, 4, 4], 6, 10],
      [8, [1, 2, 3, 4], 4, 5.85],
    ] as const) {
      const a = await start(e);
      await answers(a, n1, [...groups], n3);
      await db.query('select public.submit_attempt($1)', [a]);
      const r = await result(a);
      expect(Number(r.score?.score)).toBe(expected);
      expect(r.result_method).toBe('thpt');
      expect(r.review).toBeUndefined();
      expect(r.section_scores?.map((s) => Number(s.score))).toEqual(
        expected === 10 ? [3, 4, 3] : [2, 1.85, 2],
      );
    }
  });
  test('cấu trúc sai bị chặn save/publish; nhóm bỏ trống ý vẫn cộng đúng các ý đã chọn', async () => {
    for (const qs of [
      fixture().slice(1),
      fixture().map((q, i) => (i === 0 ? { ...q, kind: 'multiple' } : q)),
      fixture().map((q, i) => (i === 12 ? { ...q, options: options.slice(0, 3) } : q)),
    ])
      await expect(setup('thpt', 'after_submit', qs)).rejects.toThrow(/Phần/);
    await actor(admin);
    const draft = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify({ ...exam(), result_method: 'thpt', status: 'draft' }),
        JSON.stringify(questions),
      ])
    ).id;
    await expect(db.query("select public.exam_action($1,'published')", [draft])).rejects.toThrow(
      /Phần/,
    );
    const e = await setup(),
      a = await start(e),
      q = (await data(a)).questions.find((q) => q.kind === 'boolean_group')!;
    await db.query('select public.save_answer($1,$2,$3,false)', [
      a,
      q.id,
      JSON.stringify(['a:true']),
    ]);
    await db.query('select public.submit_attempt($1)', [a]);
    expect(Number((await result(a)).score?.score)).toBe(0.1);
  });
  test('counts linh hoạt, phần rỗng, câu/ý trống, không có hàng điểm 0, không vào trung bình/xếp hạng', async () => {
    const qs = [
        fixture()[0],
        fixture()[12],
        fixture()[16],
        { ...questions[0], id: 'multi', position: 2, section: 1 },
      ],
      e = await setup('counts', 'after_submit', qs),
      a = await start(e),
      d = await data(a);
    await db.query('select public.save_answer($1,$2,$3,false)', [
      a,
      d.questions.find((q) => q.kind === 'boolean_group')!.id,
      JSON.stringify(['a:true', 'c:true']),
    ]);
    await db.query('select public.save_answer($1,$2,$3,false)', [
      a,
      d.questions.find((q) => q.kind === 'multiple')!.id,
      JSON.stringify(['a', 'b']),
    ]);
    await db.query('select public.submit_attempt($1)', [a]);
    const r = await result(a);
    expect(r.score).toBeUndefined();
    expect(r.result_available).toBe(true);
    expect(
      r.section_summary?.map((s) => [
        s.correct,
        s.question_count,
        s.statement_correct,
        s.statement_total,
      ]),
    ).toEqual([
      [1, 2, 0, 0],
      [0, 1, 2, 4],
      [0, 1, 0, 0],
    ]);
    const report = (
      await one<{ r: { mean: number | null; rows: import('../src/types').Result[] } }>(
        'select public.result_report_page($1,1,10) r',
        [JSON.stringify({ exam_id: e, result_method: 'counts' })],
      )
    ).r;
    expect(report.mean).toBeNull();
    expect(report.rows[0].score).toBeUndefined();
    expect(report.rows[0].section_summary).toEqual(r.section_summary);
    await actor();
    expect(
      (
        await one<{ n: number }>(
          'select count(*)::integer n from private.scores where attempt_id=$1',
          [a],
        )
      ).n,
    ).toBe(0);
    const single = await setup('counts', 'after_submit', [fixture()[0]]),
      b = await start(single);
    await db.query('select public.submit_attempt($1)', [b]);
    expect((await result(b)).section_summary).toHaveLength(1);
  });
  test('lịch công bố và quyền: counts/thpt không lộ trước lịch, đổi phương pháp không sửa snapshot/điểm cũ', async () => {
    const e = await setup('thpt', 'never'),
      old = await start(e);
    await answers(old, 12, [4, 4, 4, 4], 6);
    await actor(admin);
    await db.query('select public.save_exam($1,$2,$3)', [
      JSON.stringify({
        ...exam('never'),
        max_attempts: 20,
        result_method: 'counts',
        practice_enabled: true,
      }),
      JSON.stringify(fixture()),
      e,
    ]);
    await actor(student);
    await db.query('select public.submit_attempt($1)', [old]);
    expect((await result(old)).result_method).toBe('thpt');
    expect((await result(old)).score).toBeUndefined();
    expect((await result(old)).section_scores).toBeUndefined();
    const fresh = await start(e);
    expect((await data(fresh)).exam.result_method).toBe('counts');
    await db.query('select public.submit_attempt($1)', [fresh]);
    expect((await result(fresh)).section_summary).toBeUndefined();
    await actor(admin);
    expect(Number((await result(old)).score?.score)).toBe(10);
    expect((await result(fresh)).section_summary).toHaveLength(3);
    await db
      .query("update public.exams set score_release='after_submit' where id=$1", [e])
      .catch(async () => {
        await actor();
        await db.query("update public.exams set score_release='after_submit' where id=$1", [e]);
      });
    await actor(student);
    expect(Number((await result(old)).score?.score)).toBe(10);
    expect((await result(fresh)).section_summary?.every((s) => s.correct === 0)).toBe(true);
    await actor(other);
    await expect(result(old)).rejects.toThrow(/Không có quyền/);
    await expect(result(fresh)).rejects.toThrow(/Không có quyền/);
  });
  test('luyện THPT chỉ có điểm sau kết thúc, lấy lần đầu; counts luyện không có điểm', async () => {
    const e = await setup(),
      a = await start(e, 'practice');
    await answers(a, 8, [1, 2, 3, 4], 4, true);
    const q = (await data(a)).questions[10],
      f = (await data(a)).practice_feedback![q.id];
    await db.query('select public.retry_practice_question($1,$2,$3)', [a, q.id, f.check_id]);
    await db.query('select public.check_practice_question($1,$2,$3,$4)', [
      a,
      q.id,
      JSON.stringify(['a']),
      crypto.randomUUID(),
    ]);
    expect((await result(a)).score).toBeUndefined();
    await db.query('select public.finish_practice($1)', [a]);
    expect(Number((await result(a)).score?.score)).toBe(5.85);
    expect((await result(a)).practice_summary?.find((s) => s.section === 1)?.first_correct).toBe(8);
    const c = await setup('counts', 'after_submit', [fixture()[0]]),
      b = await start(c, 'practice');
    await db.query('select public.finish_practice($1)', [b]);
    expect((await result(b)).score).toBeUndefined();
    expect((await result(b)).practice_summary?.[0].checked).toBe(0);
  });
});
describe('Thi thật và luyện tập trên snapshot', () => {
  test('ảnh lời giải chỉ mở sau khi kiểm tra đúng câu; không dùng lượt thi để ký ảnh', async () => {
    await actor(admin);
    const path = `${admin}/questions/practice-solution.png`;
    const id = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify({ ...exam('never'), practice_enabled: true }),
        JSON.stringify([
          {
            ...questions[1],
            attachments: [{ path, caption: 'Hình lời giải', purpose: 'solution' }],
          },
        ]),
      ])
    ).id;
    await actor(student);
    const p = await start(id),
      real = await start(id, 'exam'),
      qid = (await data(p)).questions[0].id;
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [path])).ok,
    ).toBe(false);
    expect(
      JSON.stringify(
        (await one<{ r: unknown }>('select public.attempt_image_manifest($1) r', [p])).r,
      ),
    ).not.toContain(path);
    await check(p, qid, ['t']);
    const options = (
      await one<{ r: { exams: { id: string }[] } }>('select public.result_report_page($1,1,10) r', [
        JSON.stringify({ mode: 'practice' }),
      ])
    ).r;
    expect(options.exams.some((e) => e.id === id)).toBe(true);
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [path])).ok,
    ).toBe(true);
    expect(
      JSON.stringify(
        (await one<{ r: unknown }>('select public.attempt_image_manifest($1) r', [p])).r,
      ),
    ).toContain(path);
    expect(
      JSON.stringify(
        (await one<{ r: unknown }>('select public.attempt_image_manifest($1) r', [real])).r,
      ),
    ).not.toContain(path);
    await actor(other);
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [path])).ok,
    ).toBe(false);
  });
  const group = {
    id: 'group',
    position: 3,
    section: 2,
    kind: 'boolean_group',
    content: 'Xét bốn nhận định',
    options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Nhận định ${id}` })),
    correct_ids: ['a:true', 'b:false', 'c:true', 'd:false'],
    points: 4,
    scoring_mode: 'per_statement',
    explanation: '$\\frac{1}{2}$ là phân số.',
  };
  const numeric = {
    id: 'number',
    position: 4,
    section: 3,
    kind: 'short',
    content: 'Nhập số',
    options: [],
    correct_ids: [],
    points: 1,
    short_answer: {
      mode: 'numeric',
      accepted: ['-1.25'],
      tolerance: '0.01',
      case_sensitive: false,
    },
  };
  const text = {
    ...numeric,
    id: 'text',
    position: 5,
    content: 'Nhập văn bản',
    short_answer: {
      mode: 'text',
      accepted: ['Hà Nội', 'HN'],
      tolerance: '0',
      case_sensitive: false,
    },
  };
  const qs = [
    { ...questions[1], id: 'single', section: 1, kind: 'single' },
    { ...questions[0], section: 1 },
    group,
    numeric,
    text,
  ];
  async function setup(flags = { exam_enabled: true, practice_enabled: true }) {
    await actor(admin);
    const id = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify({ ...exam(), ...flags }),
        JSON.stringify(qs),
      ])
    ).id;
    await actor(student);
    return id;
  }
  async function start(id: string, mode = 'practice') {
    return (await one<{ id: string }>('select public.start_mode_attempt($1,$2) id', [id, mode])).id;
  }
  async function data(id: string) {
    return (
      await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [id])
    ).r;
  }
  async function check(a: string, q: string, selected: string[], key = crypto.randomUUID()) {
    return (
      await one<{ r: import('../src/types').PracticeFeedback }>(
        'select public.check_practice_question($1,$2,$3,$4) r',
        [a, q, JSON.stringify(selected), key],
      )
    ).r;
  }
  test('bốn tổ hợp chế độ; lượt cũ mặc định thi thật; hai chế độ có lượt độc lập', async () => {
    for (const flags of [
      { exam_enabled: false, practice_enabled: false },
      { exam_enabled: true, practice_enabled: false },
      { exam_enabled: false, practice_enabled: true },
      { exam_enabled: true, practice_enabled: true },
    ]) {
      const id = await setup(flags);
      for (const mode of ['exam', 'practice']) {
        if (mode === 'exam' ? flags.exam_enabled : flags.practice_enabled)
          expect(await start(id, mode)).toBeTruthy();
        else await expect(start(id, mode)).rejects.toThrow(/Chế độ/);
      }
    }
    await actor();
    expect(
      (
        await one<{ mode: string }>('select mode from public.attempts where id=$1', [
          '00000000-0000-4000-8000-000000000059',
        ])
      ).mode,
    ).toBe('exam');
  });
  test('chấm đủ loại, thiếu câu/thiếu ý bị chặn; không lộ trước kiểm tra; retry giữ lần đầu và chống gửi trùng', async () => {
    const id = await setup(),
      a = await start(id),
      d = await data(a);
    expect(d.deadline).toBeNull();
    expect(d.practice_feedback).toEqual({});
    expect(JSON.stringify(d.questions)).not.toContain('correct_ids');
    expect(JSON.stringify(d.questions)).not.toContain('explanation');
    const single = d.questions.find((q) => q.kind === 'single')!,
      multiple = d.questions.find((q) => q.kind === 'multiple')!,
      g = d.questions.find((q) => q.kind === 'boolean_group')!;
    await expect(check(a, single.id, [])).rejects.toThrow(/đầy đủ/);
    await expect(check(a, g.id, ['a:true'])).rejects.toThrow(/bốn ý/);
    await expect(check(a, g.id, ['a:true', 'a:false', 'c:true', 'd:false'])).rejects.toThrow(
      /một giá trị/,
    );
    await expect(check(a, crypto.randomUUID(), ['x'])).rejects.toThrow(/không thuộc/);
    const key = crypto.randomUUID(),
      wrong = await check(a, single.id, ['f'], key);
    expect(wrong.correct).toBe(false);
    expect((await check(a, single.id, ['f'], key)).check_id).toBe(wrong.check_id);
    await db.query('select public.retry_practice_question($1,$2,$3)', [
      a,
      single.id,
      wrong.check_id,
    ]);
    expect((await data(a)).practice_feedback?.[single.id]).toBeUndefined();
    expect((await data(a)).answers[single.id]).toEqual([]);
    expect((await check(a, single.id, ['t'])).correct).toBe(true);
    const multi = await check(a, multiple.id, ['a']);
    expect(multi.correct).toBe(false);
    expect(
      (await check(a, g.id, ['a:true', 'b:true', 'c:true', 'd:false'])).statement_correct,
    ).toBe(3);
    expect(
      (
        await check(
          a,
          d.questions.find((q) => q.response_mode === 'numeric' && q.kind === 'short')!.id,
          [' -1,250 '],
        )
      ).correct,
    ).toBe(true);
    expect(
      (await check(a, d.questions.find((q) => q.response_mode === 'text')!.id, ['  hà   nội  ']))
        .correct,
    ).toBe(true);
    const reload = await data(a);
    expect(reload.practice_feedback?.[single.id].correct).toBe(true);
    await db.query('select public.finish_practice($1)', [a]);
    await db.query('select public.finish_practice($1)', [a]);
    const result = (
      await one<{ r: import('../src/types').Result }>('select public.attempt_result($1) r', [a])
    ).r;
    expect(result.practice_history?.length).toBe(6);
    expect(
      result.practice_history?.filter((c) => c.question_id === single.id).map((c) => c.correct),
    ).toEqual([false, true]);
    expect(result.practice_summary?.find((s) => s.section === 1)?.first_correct).toBe(0);
    expect(result.practice_summary?.find((s) => s.section === 2)?.statement_correct).toBe(3);
    expect(result.practice_summary?.find((s) => s.section === 3)?.first_correct).toBe(2);
    expect(result.score).toBeUndefined();
    await expect(check(a, single.id, ['t'])).rejects.toThrow(/không hợp lệ/);
  });
  test('thi thật không lấy đáp án qua practice RPC; ngoài lớp/người khác bị từ chối', async () => {
    const id = await setup(),
      real = await start(id, 'exam'),
      p = await start(id),
      q = (await data(p)).questions[0].id;
    await expect(check(real, q, ['t'])).rejects.toThrow(/Không có quyền/);
    await expect(db.query('select public.practice_history($1)', [real])).rejects.toThrow(
      /Không có quyền/,
    );
    await expect(db.query('select public.finish_practice($1)', [real])).rejects.toThrow(
      /Không có quyền/,
    );
    await expect(db.query('select public.submit_attempt($1)', [p])).rejects.toThrow(
      /Kết thúc luyện tập/,
    );
    await actor(other);
    await expect(data(p)).rejects.toThrow(/Không có quyền/);
    await expect(check(p, q, ['t'])).rejects.toThrow(/Không có quyền/);
    await expect(start(id)).rejects.toThrow(/Không được phép/);
  });
  test('tắt chế độ/đổi phiên bản và lịch không đổi lượt luyện cũ; lượt mới lấy snapshot mới', async () => {
    const id = await setup(),
      p = await start(id),
      real = await start(id, 'exam'),
      d = await data(p);
    await actor(admin);
    await db.query('select public.save_exam($1,$2,$3)', [
      JSON.stringify({
        ...exam(),
        exam_enabled: false,
        practice_enabled: false,
        schedule_scope: 'active',
        duration_minutes: 5,
      }),
      JSON.stringify(qs.map((q) => ({ ...q, content: 'Nội dung phiên bản mới' }))),
      id,
    ]);
    await actor(student);
    expect(await start(id)).toBe(p);
    expect(await start(id, 'exam')).toBe(real);
    expect((await data(p)).deadline).toBeNull();
    expect((await data(p)).questions[0].content).toBe(d.questions[0].content);
    expect((await check(p, d.questions[0].id, ['t'])).correct).toBe(true);
    await db.query('select public.finish_practice($1)', [p]);
    await expect(start(id)).rejects.toThrow(/Chế độ/);
    await actor(admin);
    await db.query('select public.save_exam($1,$2,$3)', [
      JSON.stringify({ ...exam(), practice_enabled: true }),
      JSON.stringify(qs.map((q) => ({ ...q, content: 'Nội dung phiên bản mới' }))),
      id,
    ]);
    await actor(student);
    const next = await start(id);
    expect(next).not.toBe(p);
    expect((await data(next)).questions[0].content).toBe('Nội dung phiên bản mới');
    expect((await data(next)).exam_version).toBeGreaterThan(d.exam_version!);
  });
  test('luyện không tiêu lượt, không vào điểm thi; thống kê chưa kiểm tra và lịch mở/đóng', async () => {
    const id = await setup(),
      p = await start(id);
    await db.query('select public.finish_practice($1)', [p]);
    const r = (
      await one<{ r: import('../src/types').Result }>('select public.attempt_result($1) r', [p])
    ).r;
    expect(r.practice_summary?.every((s) => s.checked === 0 && s.first_correct === 0)).toBe(true);
    const a = await start(id, 'exam');
    await db.query('select public.submit_attempt($1)', [a]);
    await expect(start(id, 'exam')).rejects.toThrow(/hết số lượt/);
    expect(await start(id)).toBeTruthy();
    const report = (
      await one<{ r: { rows: { id: string }[] } }>('select public.result_report_page($1,1,10) r', [
        JSON.stringify({ exam_id: id }),
      ])
    ).r;
    expect(report.rows.map((r) => r.id)).toEqual([a]);
    const pr = (
      await one<{ r: { rows: { id: string }[]; mean: number | null } }>(
        'select public.result_report_page($1,1,10) r',
        [JSON.stringify({ exam_id: id, mode: 'practice' })],
      )
    ).r;
    expect(pr.rows).toHaveLength(2);
    expect(pr.mean).toBeNull();
    await actor();
    expect(
      (
        await one<{ n: number }>(
          'select count(*)::integer n from private.scores where attempt_id=$1',
          [p],
        )
      ).n,
    ).toBe(0);
    await actor(admin);
    const future = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify({ ...exam(), practice_enabled: true, opens_at: '2099-01-01T00:00:00Z' }),
        JSON.stringify(qs),
      ])
    ).id;
    await actor(student);
    await expect(start(future)).rejects.toThrow(/chưa mở/);
  });
});
describe('Phân quyền và vòng đời bài kiểm tra trên PostgreSQL', () => {
  test('migration mới bảo toàn đúng/sai và điểm lịch sử trước migration', async () => {
    await actor();
    const q = await one<{ kind: string; content: string; options: unknown[] }>(
      'select * from public.questions where id=$1',
      ['00000000-0000-4000-8000-000000000058'],
    );
    expect(q.kind).toBe('boolean');
    expect(q.content).toBe('Nội dung cũ');
    expect(q.options).toEqual([
      { id: 'yes', text: 'Đúng' },
      { id: 'no', text: 'Sai' },
    ]);
    const score = await one<{ score: number; sections: unknown }>(
      'select * from private.scores where attempt_id=$1',
      ['00000000-0000-4000-8000-000000000059'],
    );
    expect(Number(score.score)).toBe(10);
    expect(score.sections).toBeNull();
    await db.query('select private.finish_attempt($1)', ['00000000-0000-4000-8000-000000000059']);
    expect(
      (
        await one<{ sections: unknown }>(
          'select sections from private.scores where attempt_id=$1',
          ['00000000-0000-4000-8000-000000000059'],
        )
      ).sections,
    ).toBeNull();
  });
  test('đúng/sai nhóm chấm từng ý, câu ngắn chuẩn hóa số/văn bản và điểm theo phần', async () => {
    await actor(admin);
    const qs = [
      {
        ...questions[0],
        kind: 'boolean_group',
        section: 2,
        points: 4,
        options: [
          { id: 'a', text: 'Ý a' },
          { id: 'b', text: 'Ý b' },
          { id: 'c', text: 'Ý c' },
          { id: 'd', text: 'Ý d' },
        ],
        correct_ids: ['a:true', 'b:false', 'c:true', 'd:false'],
        scoring_mode: 'per_statement',
      },
      {
        ...questions[1],
        kind: 'short',
        section: 3,
        points: 2,
        options: [],
        correct_ids: [],
        short_answer: {
          mode: 'numeric',
          accepted: ['-1.25'],
          tolerance: '0',
          case_sensitive: false,
        },
      },
      {
        ...questions[1],
        kind: 'short',
        section: 3,
        points: 2,
        options: [],
        correct_ids: [],
        short_answer: {
          mode: 'text',
          accepted: ['Hà Nội', 'Thủ đô Hà Nội'],
          tolerance: '0',
          case_sensitive: false,
        },
      },
    ];
    const id = (
      await one<{ id: string }>('select public.save_exam($1::jsonb,$2::jsonb) id', [
        JSON.stringify(exam()),
        JSON.stringify(qs),
      ])
    ).id;
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    const { r } = await one<{
      r: { questions: { id: string; kind: string; response_mode: string }[] };
    }>('select public.get_attempt($1) r', [a]);
    expect(JSON.stringify(r)).not.toContain('short_answer');
    for (const q of r.questions) {
      const answer =
        q.kind === 'boolean_group'
          ? ['a:true', 'b:true', 'c:true', 'd:false']
          : q.response_mode === 'numeric'
            ? [' - 1,2500 ']
            : ['  HÀ   NỘI  '];
      await db.query('select public.save_answer($1,$2,$3::jsonb,false)', [
        a,
        q.id,
        JSON.stringify(answer),
      ]);
    }
    await db.query('select public.submit_attempt($1)', [a]);
    const result = await one<{
      r: {
        score: { score: number; earned: number; sections: { section: number; earned: number }[] };
      };
    }>('select public.attempt_result($1) r', [a]);
    expect(Number(result.r.score.earned)).toBe(7);
    expect(Number(result.r.score.score)).toBe(8.75);
    expect(result.r.score.sections.map((s) => Number(s.earned))).toEqual([3, 4]);
  });
  test('lưu từng ý Đ/S giữ các ý khác, tải lại đúng và chặn người khác/hết giờ', async () => {
    await actor(admin);
    const group = {
      ...questions[0],
      kind: 'boolean_group',
      section: 2,
      options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id })),
      correct_ids: ['a:true', 'b:false', 'c:true', 'd:false'],
    };
    const id = (
      await one<{ id: string }>('select public.save_exam($1::jsonb,$2::jsonb) id', [
        JSON.stringify(exam()),
        JSON.stringify([group]),
      ])
    ).id;
    await actor(student);
    const attempt = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    const q = (
      await one<{ r: { questions: { id: string }[] } }>('select public.get_attempt($1) r', [
        attempt,
      ])
    ).r.questions[0].id;
    const save = (statement: string, value: string | null) =>
      db.query('select public.save_statement($1,$2,$3,$4,false)', [attempt, q, statement, value]);
    await save('a', 'true');
    await save('b', 'false');
    await save('a', 'false');
    await save('c', 'true');
    await save('d', 'false');
    const read = async () =>
      (
        await one<{ r: { answers: Record<string, string[]> } }>('select public.get_attempt($1) r', [
          attempt,
        ])
      ).r.answers[q];
    expect((await read()).sort()).toEqual(['a:false', 'b:false', 'c:true', 'd:false']);
    await save('b', null);
    expect((await read()).sort()).toEqual(['a:false', 'c:true', 'd:false']);
    await expect(save('a', 'bad')).rejects.toThrow(/hợp lệ/);
    await actor(other);
    await expect(save('a', 'true')).rejects.toThrow(/quyền/);
    await actor();
    await db.query("update public.attempts set deadline=now()-interval '1 second' where id=$1", [
      attempt,
    ]);
    await actor(student);
    expect(
      (
        await one<{ r: string }>('select public.save_statement($1,$2,$3,$4,false) r', [
          attempt,
          q,
          'a',
          'true',
        ])
      ).r,
    ).toBe('closed');
    expect((await read()).sort()).toEqual(['a:false', 'c:true', 'd:false']);
  });
  test('PDF nhiều trang: giới hạn, chống lặp trang và bảo vệ metadata nguồn', async () => {
    await actor(admin);
    const request = crypto.randomUUID();
    const create = () =>
      one<{ id: string }>('select public.create_document_import($1,20,$2,30) id', [
        request,
        'Mẫu scan.pdf',
      ]);
    const bid = (await create()).id;
    expect((await create()).id).toBe(bid);
    await expect(
      db.query('select public.create_document_import($1,31,$2,40)', [
        crypto.randomUUID(),
        'Sai.pdf',
      ]),
    ).rejects.toThrow();
    const imageId = crypto.randomUUID(),
      path = `${admin}/${bid}/pdf-page.jpg`;
    await actor();
    await db.query("insert into storage.objects(bucket_id,name) values('exam-imports',$1)", [path]);
    await actor(admin);
    const register = (id: string) =>
      db.query('select public.register_document_page($1,$2,$3,1,$4,2,$5)', [
        bid,
        id,
        path,
        'trang 2.jpg',
        'PHẦN II.',
      ]);
    await register(imageId);
    await register(imageId);
    await expect(register(crypto.randomUUID())).rejects.toThrow(/đã có/);
    expect(
      (
        await one<{ pdf_page: number; pdf_text: string }>(
          'select pdf_page,pdf_text from public.import_images where id=$1',
          [imageId],
        )
      ).pdf_page,
    ).toBe(2);
    await actor(student);
    expect(
      (await db.query('select * from public.import_images where id=$1', [imageId])).rows,
    ).toHaveLength(0);
    await expect(register(crypto.randomUUID())).rejects.toThrow(/quyền/);
  });
  test('JSON: AI không cần xác nhận, công bố trực tiếp, nhập trùng và chấm đủ ba loại', async () => {
    const doc = validateDocument(
      JSON.parse(readFileSync('docs/import/example.json', 'utf8')),
    ).document!;
    doc.sections[0].questions[0].answer.origin = 'ai';
    const qs = documentQuestions(doc);
    qs[0].tables = [
      {
        id: 'data',
        caption: 'Bảng số liệu',
        headers: ['x', 'y'],
        rows: [
          ['1', '2'],
          ['3', '4'],
        ],
      },
    ];
    await actor(admin);
    const create = () =>
      one<{ id: string }>('select public.save_json_import($1,$2::jsonb,$3::jsonb) id', [
        doc.package_id,
        JSON.stringify({ ...exam(), ...doc.exam }),
        JSON.stringify(qs),
      ]);
    const id = (await create()).id;
    expect((await create()).id).toBe(id);
    const uncheckedCopy = (
      await one<{ id: string }>("select public.exam_action($1,'copy') id", [id])
    ).id;
    const copiedTable = (
      await one<{ r: { questions: typeof qs } }>('select public.author_exam($1) r', [uncheckedCopy])
    ).r.questions[0].tables;
    expect(copiedTable).toEqual(qs[0].tables);
    await db.query("select public.exam_action($1,'published')", [uncheckedCopy]);
    await db.query("select public.exam_action($1,'published')", [id]);
    let authored = (
      await one<{ r: { questions: typeof qs } }>('select public.author_exam($1) r', [id])
    ).r;
    expect(authored.questions.map((q) => q.json_source?.question_id)).toEqual(qs.map((q) => q.id));
    const confirmed = authored.questions;
    await db.query('select public.save_exam($1::jsonb,$2::jsonb,$3)', [
      JSON.stringify(exam()),
      JSON.stringify(confirmed),
      id,
    ]);
    const copied = (await one<{ id: string }>("select public.exam_action($1,'copy') id", [id])).id;
    authored = (
      await one<{ r: { questions: typeof qs } }>('select public.author_exam($1) r', [copied])
    ).r;
    expect(authored.questions.every((q) => q.json_source?.confirmed === false)).toBe(true);
    expect(authored.questions[0].json_source?.answer_origin).toBe('ai');
    await actor(student);
    await expect(create()).rejects.toThrow(/quyền/);
    await expect(db.query('select * from private.json_question_sources')).rejects.toThrow();
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    const live = (
      await one<{ r: { questions: typeof qs } }>('select public.get_attempt($1) r', [a])
    ).r;
    expect(JSON.stringify(live)).not.toMatch(/correct_ids|json_source|short_answer/);
    expect(live.questions.find((q) => q.kind === 'single')?.tables).toEqual(qs[0].tables);
    for (const q of live.questions) {
      const answer =
        q.kind === 'single'
          ? ['I-Q1-B']
          : q.kind === 'boolean_group'
            ? ['II-Q1-d:false', 'II-Q1-b:false', 'II-Q1-a:true', 'II-Q1-c:true']
            : q.response_mode === 'numeric'
              ? [' - 1,24 ']
              : [' HÀ   NỘI '];
      await db.query('select public.save_answer($1,$2,$3::jsonb,false)', [
        a,
        q.id,
        JSON.stringify(answer),
      ]);
    }
    await db.query('select public.submit_attempt($1)', [a]);
    const result = (
      await one<{ r: { score: { score: number; earned: number }; review: unknown } }>(
        'select public.attempt_result($1) r',
        [a],
      )
    ).r;
    expect(Number(result.score.score)).toBe(10);
    expect(Number(result.score.earned)).toBe(8);
    await actor(admin);
    await db.query('select public.save_exam($1::jsonb,$2::jsonb,$3)', [
      JSON.stringify(exam()),
      JSON.stringify(confirmed),
      id,
    ]);
  });
  test('ảnh học sinh: bypass RLS questions có kiểm soát; own attempt, draft, outsider và lịch đáp án', async () => {
    await actor(admin);
    const image = `${admin}/questions/existing-zip.jpg`,
      solution = `${admin}/questions/solution.jpg`,
      draft = `${admin}/questions/draft.jpg`;
    const payload = { ...exam('never'), shuffle_questions: false, shuffle_options: false };
    const q = {
      ...questions[0],
      attachments: [
        { path: image, caption: 'Ảnh ZIP', placement: 'right', target_id: 'a' },
        { path: solution, caption: 'Lời giải', purpose: 'solution' },
      ],
    };
    const id = (
      await one<{ id: string }>('select public.save_exam($1::jsonb,$2::jsonb) id', [
        JSON.stringify(payload),
        JSON.stringify([q]),
      ])
    ).id;
    await one('select public.save_exam($1::jsonb,$2::jsonb) id', [
      JSON.stringify({ ...payload, status: 'draft' }),
      JSON.stringify([{ ...q, attachments: [{ path: draft, caption: 'Nháp' }] }]),
    ]);
    await actor();
    await db.exec('grant select on storage.objects to authenticated');
    for (const path of [image, solution, draft])
      await db.query("insert into storage.objects(bucket_id,name) values('classroom',$1)", [path]);
    await actor(student);
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [image])).ok,
    ).toBe(false);
    const attempt = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    expect(
      (await db.query('select * from public.questions where exam_id=$1', [id])).rows,
    ).toHaveLength(0);
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [image])).ok,
    ).toBe(true);
    expect(
      (
        await db.query("select name from storage.objects where bucket_id='classroom' and name=$1", [
          image,
        ])
      ).rows,
    ).toHaveLength(1);
    for (const path of [solution, draft, 'other/random.jpg'])
      expect(
        (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [path])).ok,
      ).toBeFalsy();
    const manifest = (
      await one<{ r: { path: string; placement: string; target_id: string }[] }>(
        'select public.attempt_image_manifest($1,$2) r',
        [attempt, 'attempt'],
      )
    ).r;
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ path: image, placement: 'right', target_id: 'a' });
    const live = (
      await one<{ r: { questions: { attachments: unknown[] }[] } }>(
        'select public.get_attempt($1) r',
        [attempt],
      )
    ).r;
    expect(JSON.stringify(live)).not.toContain('solution.jpg');
    await actor(other);
    await expect(
      db.query('select public.attempt_image_manifest($1,$2)', [attempt, 'attempt']),
    ).rejects.toThrow(/quyền/);
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [image])).ok,
    ).toBe(false);
    await actor(student);
    await db.query('select public.submit_attempt($1)', [attempt]);
    expect(
      (
        await one<{ r: unknown[] }>('select public.attempt_image_manifest($1,$2) r', [
          attempt,
          'result',
        ])
      ).r,
    ).toHaveLength(1);
    await actor();
    await db.query("update public.exams set answer_release='after_submit' where id=$1", [id]);
    await actor(student);
    expect(
      (
        await one<{ r: unknown[] }>('select public.attempt_image_manifest($1,$2) r', [
          attempt,
          'result',
        ])
      ).r,
    ).toHaveLength(2);
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [solution])).ok,
    ).toBe(true);
  });
  test('số chính xác dùng numeric, sai số và văn bản phân biệt hoa/thường', async () => {
    await actor();
    for (const [value, config, expected] of [
      ['0,30000000000000000001', { mode: 'numeric', accepted: ['0.3'], tolerance: '0' }, false],
      ['-1.24', { mode: 'numeric', accepted: ['-1.25'], tolerance: '0.01' }, true],
      ['1/2', { mode: 'numeric', accepted: ['0.5'], tolerance: '0' }, false],
      ['Ha Noi', { mode: 'text', accepted: ['ha noi'], case_sensitive: true }, false],
      ['Hà  Nội', { mode: 'text', accepted: ['Hà Nội'], case_sensitive: true }, true],
    ] as const) {
      expect(
        (
          await one<{ ok: boolean }>('select private.match_short($1::jsonb,$2::jsonb) ok', [
            JSON.stringify([value]),
            JSON.stringify(config),
          ])
        ).ok,
      ).toBe(expected);
    }
  });
  test('nháp thiếu đáp án lưu được nhưng công bố bị chặn ở database', async () => {
    await actor(admin);
    const q = {
      ...questions[1],
      kind: 'short',
      section: 3,
      options: [],
      correct_ids: [],
      short_answer: null,
    };
    const id = (
      await one<{ id: string }>('select public.save_exam($1::jsonb,$2::jsonb) id', [
        JSON.stringify({ ...exam(), status: 'draft' }),
        JSON.stringify([q]),
      ])
    ).id;
    await expect(db.query("select public.exam_action($1,'published')", [id])).rejects.toThrow(
      /thiếu/,
    );
  });
  test('tạo đề có request_id chống gửi trùng và bản sao giữ kiểu mới', async () => {
    await actor(admin);
    const request = crypto.randomUUID();
    const payload = JSON.stringify({ ...exam(), request_id: request });
    const [a, b] = await Promise.all([
      one<{ id: string }>('select public.save_exam($1::jsonb,$2::jsonb) id', [
        payload,
        JSON.stringify(questions),
      ]),
      one<{ id: string }>('select public.save_exam($1::jsonb,$2::jsonb) id', [
        payload,
        JSON.stringify(questions),
      ]),
    ]);
    expect(a.id).toBe(b.id);
    const copied = (await one<{ id: string }>("select public.exam_action($1,'copy') id", [a.id]))
      .id;
    expect(copied).not.toBe(a.id);
  });
  test('lô OCR chỉ admin truy cập, lease chống gọi trùng và xác nhận nhập idempotent', async () => {
    await actor(student);
    await expect(
      db.query('select public.create_import_batch($1,1)', [crypto.randomUUID()]),
    ).rejects.toThrow(/quyền/);
    await actor(admin);
    const request = crypto.randomUUID();
    const bid = (await one<{ id: string }>('select public.create_import_batch($1,1) id', [request]))
      .id;
    expect(
      (await one<{ id: string }>('select public.create_import_batch($1,1) id', [request])).id,
    ).toBe(bid);
    const image = crypto.randomUUID();
    const path = `${admin}/${bid}/image.jpg`;
    await actor();
    await db.query("insert into storage.objects(bucket_id,name) values('exam-imports',$1)", [path]);
    await actor(admin);
    await db.query('select public.register_import_image($1,$2,$3,1,$4)', [
      bid,
      image,
      path,
      'test.jpg',
    ]);
    const lease = (
      await one<{ r: { lease_token: string } }>('select public.claim_import_image($1) r', [image])
    ).r;
    await expect(db.query('select public.claim_import_image($1)', [image])).rejects.toThrow(
      /đang được/,
    );
    expect(
      (
        await one<{ ok: boolean }>('select public.finish_import_image($1,$2,$3::jsonb,null) ok', [
          image,
          crypto.randomUUID(),
          '{"questions":[]}',
        ])
      ).ok,
    ).toBe(false);
    await db.query('select public.finish_import_image($1,$2,$3::jsonb,null)', [
      image,
      lease.lease_token,
      '{"questions":[]}',
    ]);
    const proposed = [
      {
        ...questions[1],
        id: 'candidate',
        correct_ids: [],
        source_refs: [{ image_id: image, page: 1 }],
        import_key: `${bid}/candidate`,
      },
    ];
    const confirmed = (
      await one<{ r: unknown }>('select public.confirm_import($1,$2::jsonb) r', [
        bid,
        JSON.stringify(proposed),
      ])
    ).r;
    expect(
      (await one<{ r: unknown }>('select public.confirm_import($1,$2::jsonb) r', [bid, '[]'])).r,
    ).toEqual(confirmed);
    const id = (
      await one<{ id: string }>('select public.save_exam($1::jsonb,$2::jsonb) id', [
        JSON.stringify({ ...exam(), status: 'draft' }),
        JSON.stringify(proposed),
      ])
    ).id;
    await expect(
      db.query('select public.save_exam($1::jsonb,$2::jsonb)', [
        JSON.stringify({ ...exam(), status: 'draft' }),
        JSON.stringify(proposed),
      ]),
    ).rejects.toThrow(/unique/);
    await actor(student);
    expect((await db.query('select * from public.import_batches')).rows).toHaveLength(0);
    expect((await db.query('select * from public.import_images')).rows).toHaveLength(0);
    await expect(db.query('select public.claim_import_image($1)', [image])).rejects.toThrow(
      /quyền/,
    );
    expect(id).toBeTruthy();
  });
  test('OCR giới hạn hai ảnh đồng thời, ba lần thử và quota theo giờ', async () => {
    await actor(admin);
    const bid = (
      await one<{ id: string }>('select public.create_import_batch($1,3) id', [crypto.randomUUID()])
    ).id;
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (let i = 0; i < 3; i++) {
      const path = `${admin}/${bid}/limit-${i}.jpg`;
      await actor();
      await db.query("insert into storage.objects(bucket_id,name) values('exam-imports',$1)", [
        path,
      ]);
      await actor(admin);
      await db.query('select public.register_import_image($1,$2,$3,$4,$5)', [
        bid,
        ids[i],
        path,
        i + 1,
        `limit-${i}.jpg`,
      ]);
    }
    const first = (
      await one<{ r: { lease_token: string } }>('select public.claim_import_image($1) r', [ids[0]])
    ).r;
    const second = (
      await one<{ r: { lease_token: string } }>('select public.claim_import_image($1) r', [ids[1]])
    ).r;
    await expect(db.query('select public.claim_import_image($1)', [ids[2]])).rejects.toThrow(
      /2 ảnh/,
    );
    let token = first.lease_token;
    for (let i = 0; i < 3; i++) {
      await db.query("select public.finish_import_image($1,$2,null,'Lỗi thử')", [ids[0], token]);
      if (i < 2)
        token = (
          await one<{ r: { lease_token: string } }>('select public.claim_import_image($1) r', [
            ids[0],
          ])
        ).r.lease_token;
    }
    await expect(db.query('select public.claim_import_image($1)', [ids[0]])).rejects.toThrow(
      /3 lần/,
    );
    await db.query("select public.finish_import_image($1,$2,'{}'::jsonb,null)", [
      ids[1],
      second.lease_token,
    ]);
    await actor();
    await db.query(
      'insert into private.ocr_calls(user_id) select $1::uuid from generate_series(1,30)',
      [admin],
    );
    await actor(admin);
    await expect(db.query('select public.claim_import_image($1)', [ids[2]])).rejects.toThrow(
      /30 lần/,
    );
  });
  test('email admin chưa xác minh không được cấp quyền; xác minh mới nâng quyền', async () => {
    const temporary = '00000000-0000-4000-8000-000000000009';
    await actor();
    await db.query("insert into auth.users(id,email) values($1,'LCONGHIEU0108@gmail.com')", [
      temporary,
    ]);
    await actor(temporary);
    expect((await one<{ ok: boolean }>('select public.is_admin() ok')).ok).toBe(false);
    await actor();
    await db.query('update auth.users set email_confirmed_at=now() where id=$1', [temporary]);
    await actor(temporary);
    expect((await one<{ ok: boolean }>('select public.is_admin() ok')).ok).toBe(true);
    await actor();
    await db.query('delete from auth.users where id=$1', [temporary]);
  });
  test('mở/đóng bài được kiểm tra bằng thời gian database', async () => {
    const id = await createExam();
    await actor();
    await db.query("update public.exams set opens_at=now()+interval '1 day' where id=$1", [id]);
    await actor(student);
    await expect(db.query('select public.start_attempt($1)', [id])).rejects.toThrow(/chưa mở/);
    await actor();
    await db.query(
      "update public.exams set opens_at=null,closes_at=now()-interval '1 second' where id=$1",
      [id],
    );
    await actor(student);
    await expect(db.query('select public.start_attempt($1)', [id])).rejects.toThrow(/đã đóng/);
  });
  test('hai yêu cầu bắt đầu đồng thời trả cùng ID và chỉ tạo một lượt', async () => {
    const id = await createExam();
    await actor(student);
    const [a, b] = await Promise.all([
      one<{ id: string }>('select public.start_attempt($1) id', [id]),
      one<{ id: string }>('select public.start_attempt($1) id', [id]),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      (await db.query('select id from public.attempts where exam_id=$1', [id])).rows,
    ).toHaveLength(1);
  });
  test('đáp án và điểm chỉ mở sau đóng bài, cấu hình hai mục độc lập', async () => {
    const id = await createExam('after_close');
    await actor();
    await db.query(
      "update public.exams set closes_at=now()+interval '1 hour',score_release='after_submit' where id=$1",
      [id],
    );
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    await db.query('select public.submit_attempt($1)', [a]);
    const before = await one<{ r: Record<string, unknown> }>('select public.attempt_result($1) r', [
      a,
    ]);
    expect(before.r.score).toBeDefined();
    expect(before.r.review).toBeUndefined();
    await actor();
    await db.query("update public.exams set closes_at=now()-interval '1 second' where id=$1", [id]);
    await actor(student);
    expect(
      (await one<{ r: Record<string, unknown> }>('select public.attempt_result($1) r', [a])).r
        .review,
    ).toBeDefined();
  });
  test('bootstrap admin từ email xác minh; bỏ qua role metadata của client', async () => {
    await actor(student);
    const p = await one<{ role: string }>('select role from public.profiles where id=auth.uid()');
    expect(p.role).toBe('student');
    expect((await one<{ ok: boolean }>('select public.is_admin() ok')).ok).toBe(false);
    await expect(
      db.query("update public.profiles set role='admin' where id=auth.uid()"),
    ).rejects.toThrow(/permission denied/);
    await actor(admin);
    expect((await one<{ ok: boolean }>('select public.is_admin() ok')).ok).toBe(true);
  });
  test('người ngoài không đọc lớp, đề; học sinh không có quyền quản trị', async () => {
    await actor(other);
    expect((await db.query('select * from public.classes')).rows).toHaveLength(0);
    expect((await db.query('select * from public.exams')).rows).toHaveLength(0);
    await expect(db.query('select public.start_attempt($1)', [eid])).rejects.toThrow(
      /Không được phép/,
    );
    await actor(student);
    await expect(db.query("select public.manage_invite($1,'create')", [cid])).rejects.toThrow(
      /Không có quyền/,
    );
  });
  test('lời mời hết hạn và email chưa xác minh bị từ chối', async () => {
    await actor(admin);
    const inv = await one<{ r: { token: string } }>(
      "select public.manage_invite($1,'create',now()-interval '1 minute') r",
      [cid],
    );
    await actor(other);
    await expect(db.query('select public.join_class($1)', [inv.r.token])).rejects.toThrow(
      /hết hạn/,
    );
    await actor(unverified);
    await expect(db.query('select public.join_class($1)', [inv.r.token])).rejects.toThrow(
      /xác minh/,
    );
  });
  test('bắt đầu idempotent; lưu ổn định thứ tự xáo; không lộ đáp án', async () => {
    await actor(student);
    aid = (await one<{ id: string }>('select public.start_attempt($1) id', [eid])).id;
    expect((await one<{ id: string }>('select public.start_attempt($1) id', [eid])).id).toBe(aid);
    const first = await one<{ r: Record<string, unknown> }>('select public.get_attempt($1) r', [
      aid,
    ]);
    const second = await one<{ r: Record<string, unknown> }>('select public.get_attempt($1) r', [
      aid,
    ]);
    expect(first.r.question_order).toEqual(second.r.question_order);
    expect(first.r.option_order).toEqual(second.r.option_order);
    expect(JSON.stringify(first)).not.toContain('correct_ids');
    expect(JSON.stringify(first)).not.toContain('explanation');
    expect((await db.query('select * from public.questions')).rows).toHaveLength(0);
    await expect(db.query('select * from private.answer_keys')).rejects.toThrow(
      /permission denied/,
    );
  });
  test('lưu database qua reload, từ chối chọn thừa và tùy chọn lạ', async () => {
    await actor(student);
    const { r } = await one<{ r: { questions: { id: string; kind: string }[] } }>(
      'select public.get_attempt($1) r',
      [aid],
    );
    const multi = r.questions.find((q) => q.kind === 'multiple')!;
    await db.query('select public.save_answer($1,$2,$3::jsonb,true)', [
      aid,
      multi.id,
      JSON.stringify(['a', 'b']),
    ]);
    const saved = await one<{ r: { answers: Record<string, string[]>; flagged: string[] } }>(
      'select public.get_attempt($1) r',
      [aid],
    );
    expect(saved.r.answers[multi.id]).toEqual(['a', 'b']);
    expect(saved.r.flagged).toContain(multi.id);
    await expect(
      db.query('select public.save_answer($1,$2,$3::jsonb,false)', [aid, multi.id, '["hacked"]']),
    ).rejects.toThrow(/không hợp lệ/);
    await expect(
      db.query('select public.save_answer($1,$2,$3::jsonb,false)', [aid, multi.id, '["a","a"]']),
    ).rejects.toThrow(/không hợp lệ/);
  });
  test('sửa đề đã có lượt giữ snapshot; nộp hai lần chỉ có một kết quả; giới hạn số lượt', async () => {
    await actor(admin);
    await db.query('select public.save_exam($1::jsonb,$2::jsonb,$3)', [
      JSON.stringify(exam()),
      JSON.stringify(questions),
      eid,
    ]);
    await actor(student);
    await db.query('select public.submit_attempt($1)', [aid]);
    await db.query('select public.submit_attempt($1)', [aid]);
    const { r } = await one<{
      r: { score: { score: number; correct: number; unanswered: number } };
    }>('select public.attempt_result($1) r', [aid]);
    expect(Number(r.score.score)).toBe(6.67);
    expect(r.score.correct).toBe(1);
    expect(r.score.unanswered).toBe(1);
    await expect(db.query('select public.start_attempt($1)', [eid])).rejects.toThrow(/hết số lượt/);
  });
  test('không đọc điểm/lượt của người khác hoặc ghi câu trả lời đã nộp', async () => {
    await actor(other);
    expect((await db.query('select * from public.attempts')).rows).toHaveLength(0);
    await expect(db.query('select public.attempt_result($1)', [aid])).rejects.toThrow(
      /Không có quyền/,
    );
    await actor(student);
    const q = (await one<{ id: string }>('select id from public.attempts where id=$1', [aid])).id;
    expect(q).toBe(aid);
    const { r } = await one<{ r: { questions: { id: string }[] } }>(
      'select public.get_attempt($1) r',
      [aid],
    );
    expect(
      (
        await one<{ s: string }>('select public.save_answer($1,$2,$3::jsonb,false) s', [
          aid,
          r.questions[0].id,
          '[]',
        ])
      ).s,
    ).toBe('closed');
  });
  test('chọn thừa hoặc thiếu không được điểm; chấm quy đổi 10 nhất quán', async () => {
    const id = await createExam();
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    const { r } = await one<{ r: { questions: { id: string; kind: string }[] } }>(
      'select public.get_attempt($1) r',
      [a],
    );
    for (const q of r.questions)
      await db.query('select public.save_answer($1,$2,$3::jsonb,false)', [
        a,
        q.id,
        JSON.stringify(q.kind === 'multiple' ? ['a', 'b', 'c'] : ['t']),
      ]);
    await db.query('select public.submit_attempt($1)', [a]);
    const result = await one<{ r: { score: { score: number; correct: number; wrong: number } } }>(
      'select public.attempt_result($1) r',
      [a],
    );
    expect(Number(result.r.score.score)).toBe(3.33);
    expect(result.r.score.wrong).toBe(1);
    expect(result.r.score.correct).toBe(1);
    await actor();
    expect((await one<{ r: boolean }>(`select private.exact_match('["a"]','["a","b"]') r`)).r).toBe(
      false,
    );
  });
  test('không công bố: điểm và lời giải không xuất hiện cả ở báo cáo', async () => {
    const id = await createExam('never');
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    await db.query('select public.submit_attempt($1)', [a]);
    const { r } = await one<{ r: Record<string, unknown> }>('select public.attempt_result($1) r', [
      a,
    ]);
    expect(r.score).toBeUndefined();
    expect(r.review).toBeUndefined();
    const report = await one<{ r: Record<string, unknown>[] }>('select public.result_report() r');
    expect(report.r.find((x) => x.id === a)?.score).toBeUndefined();
    await actor(admin);
    const teacher = await one<{ r: Record<string, unknown> }>(
      'select public.attempt_result($1) r',
      [a],
    );
    expect(teacher.r.score).toBeDefined();
    expect(teacher.r.review).toBeDefined();
  });
  test('hết giờ độc lập trình duyệt; cron chấm điểm và chặn trả lời muộn', async () => {
    const id = await createExam();
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    await actor();
    await db.query("update public.attempts set deadline=now()-interval '1 second' where id=$1", [
      a,
    ]);
    await db.exec('select private.expire_attempts()');
    const row = await one<{ status: string; submitted_at: Date; deadline: Date }>(
      'select * from public.attempts where id=$1',
      [a],
    );
    expect(row.status).toBe('expired');
    expect(row.submitted_at).toEqual(row.deadline);
    expect(
      (await db.query('select * from private.scores where attempt_id=$1', [a])).rows,
    ).toHaveLength(1);
  });
  test('sao chép tạo version mới, bản gốc và điểm được bảo toàn', async () => {
    await actor(admin);
    const copied = (await one<{ id: string }>("select public.exam_action($1,'copy') id", [eid])).id;
    const row = await one<{
      r: { version: number; status: string; locked: boolean; questions: unknown[] };
    }>('select public.author_exam($1) r', [copied]);
    const original = (
      await one<{ r: { version: number } }>('select public.author_exam($1) r', [eid])
    ).r;
    expect(row.r.version).toBe(original.version + 1);
    expect(row.r.status).toBe('draft');
    expect(row.r.locked).toBe(false);
    expect(row.r.questions).toHaveLength(2);
  });
  test('chọn đúng toàn bộ được 10 điểm; kết quả giữ nguyên sau nộp', async () => {
    const id = await createExam();
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [id])).id;
    const { r } = await one<{ r: { questions: { id: string; kind: string }[] } }>(
      'select public.get_attempt($1) r',
      [a],
    );
    for (const q of r.questions)
      await db.query('select public.save_answer($1,$2,$3::jsonb,false)', [
        a,
        q.id,
        JSON.stringify(q.kind === 'multiple' ? ['b', 'a'] : ['t']),
      ]);
    await db.query('select public.submit_attempt($1)', [a]);
    const result = await one<{ r: { score: { score: number; earned: number; total: number } } }>(
      'select public.attempt_result($1) r',
      [a],
    );
    expect(Number(result.r.score.score)).toBe(10);
    expect(Number(result.r.score.earned)).toBe(Number(result.r.score.total));
  });
  test('tạo lại và thu hồi link vô hiệu hóa lời mời cũ', async () => {
    await actor(admin);
    const old = await one<{ r: { token: string } }>("select public.manage_invite($1,'create') r", [
      cid,
    ]);
    const fresh = await one<{ r: { token: string } }>(
      "select public.manage_invite($1,'create') r",
      [cid],
    );
    await actor(other);
    await expect(db.query('select public.join_class($1)', [old.r.token])).rejects.toThrow(
      /hết hạn/,
    );
    await actor(admin);
    await db.query("select public.manage_invite($1,'revoke')", [cid]);
    await actor(other);
    await expect(db.query('select public.join_class($1)', [fresh.r.token])).rejects.toThrow(
      /hết hạn/,
    );
  });
  test('báo cáo SQL phân trang, thống kê điểm cuối và không thay đổi lượt đang làm', async () => {
    const e = await createExam();
    await actor(admin);
    await db.exec('reset role');
    await db.query('update public.exams set max_attempts=3 where id=$1', [e]);
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    await db.query('select public.submit_attempt($1)', [a]);
    const b = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const q = (
      await one<{ r: { questions: { id: string; kind: string }[] } }>(
        'select public.get_attempt($1) r',
        [b],
      )
    ).r.questions;
    for (const question of q)
      await db.query('select public.save_answer($1,$2,$3,false)', [
        b,
        question.id,
        JSON.stringify(question.kind === 'multiple' ? ['a', 'b'] : ['t']),
      ]);
    await db.query('select public.submit_attempt($1)', [b]);
    const live = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const before = await one('select id,deadline,answers,status from public.attempts where id=$1', [
      live,
    ]);
    const scope = JSON.stringify({ exam_id: e });
    const first = (
      await one<{
        r: { rows: Record<string, unknown>[]; total: number; mean: number; distribution: number[] };
      }>('select public.result_report_page($1,1,1) r', [scope])
    ).r;
    expect(first.total).toBe(3);
    expect(first.rows).toHaveLength(1);
    expect(Number(first.mean)).toBe(10);
    expect(first.distribution).toEqual([0, 0, 0, 1]);
    expect(first.rows[0]).not.toHaveProperty('answers');
    expect(first.rows[0]).not.toHaveProperty('review');
    expect(first.rows[0]).not.toHaveProperty('option_order');
    const second = (
      await one<{ r: { rows: { id: string }[] } }>('select public.result_report_page($1,2,1) r', [
        scope,
      ])
    ).r;
    expect(second.rows[0].id).not.toBe(first.rows[0].id);
    const finals = (
      await one<{ r: { rows: { id: string }[]; total: number } }>(
        'select public.result_report_page($1,1,10) r',
        [JSON.stringify({ exam_id: e, final: 'true' })],
      )
    ).r;
    expect(finals.total).toBe(1);
    expect(finals.rows[0].id).toBe(b);
    expect(
      await one('select id,deadline,answers,status from public.attempts where id=$1', [live]),
    ).toEqual(before);
    await db.query('select public.submit_attempt($1)', [live]);
    await actor(admin);
    await db.exec('reset role');
    await db.query("update public.exams set score_method='latest' where id=$1", [e]);
    await actor(student);
    const latest = (
      await one<{ r: { rows: { id: string }[]; mean: number } }>(
        'select public.result_report_page($1,1,10) r',
        [JSON.stringify({ exam_id: e, final: 'true' })],
      )
    ).r;
    expect(latest.rows[0].id).toBe(live);
    expect(Number(latest.mean)).toBe(0);
  });
  test('báo cáo phân trang giữ kín điểm chưa công bố và không lộ lựa chọn lớp của người khác', async () => {
    const e = await createExam('never');
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    await db.query('select public.submit_attempt($1)', [a]);
    const scope = JSON.stringify({ exam_id: e });
    const hidden = (
      await one<{ r: { rows: Record<string, unknown>[]; mean: null; distribution: number[] } }>(
        'select public.result_report_page($1,1,10) r',
        [scope],
      )
    ).r;
    expect(hidden.rows[0]).not.toHaveProperty('score');
    expect(hidden.mean).toBeNull();
    expect(hidden.distribution).toEqual([0, 0, 0, 0]);
    await expect(db.query("select * from private.report_rows('{}',true)")).rejects.toThrow(
      /permission denied/,
    );
    await actor(unverified);
    const outsider = (
      await one<{ r: { total: number; classes: unknown[]; exams: unknown[] } }>(
        'select public.result_report_page($1,1,10) r',
        [scope],
      )
    ).r;
    expect(outsider.total).toBe(0);
    expect(outsider.classes).toEqual([]);
    expect(outsider.exams).toEqual([]);
    await actor(admin);
    const teacher = (
      await one<{ r: { rows: { score: unknown }[] } }>(
        'select public.result_report_page($1,1,10) r',
        [scope],
      )
    ).r;
    expect(teacher.rows[0].score).toBeDefined();
  });
  test('không cho NULL bỏ giới hạn phân trang hoặc gọi hàm triển khai riêng tư', async () => {
    await actor(student);
    for (const args of [
      [null, 1, 10],
      ['{}', null, 10],
      ['{}', 1, null],
      ['{}', 1, 501],
      ['{}', 1000001, 10],
    ])
      await expect(db.query('select public.result_report_page($1,$2,$3)', args)).rejects.toThrow(
        /Phân trang/,
      );
    await expect(db.query("select private.result_report_page_data('{}',1,10)")).rejects.toThrow(
      /permission denied/,
    );
  });
  test('sửa cùng link: lượt đang làm/đã nộp giữ nội dung, hình, đáp án, điểm và thứ tự; lượt mới dùng version mới', async () => {
    await actor(admin);
    const payload = { ...exam(), max_attempts: 3 };
    const source = {
      package_id: crypto.randomUUID(),
      question_id: 'stable-q',
      answer_origin: 'ai',
      confirmed: false,
    };
    const original = {
      ...questions[0],
      kind: 'single',
      section: 1,
      content: 'Nội dung bản 1',
      options: [
        { id: 'a', text: 'Một' },
        { id: 'b', text: 'Hai' },
        { id: 'c', text: 'Ba' },
        { id: 'd', text: 'Bốn' },
      ],
      correct_ids: ['a'],
      points: 2,
      json_source: source,
      attachments: [
        {
          path: `${admin}/questions/v1.png`,
          caption: 'Hình cũ',
          placement: 'right',
          target_id: 'a',
        },
      ],
    };
    const e = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify(payload),
        JSON.stringify([original]),
      ])
    ).id;
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const before = (
      await one<{
        r: {
          questions: { id: string }[];
          deadline: string;
          question_order: string[];
          option_order: unknown;
          exam_version: number;
        };
      }>('select public.get_attempt($1) r', [a])
    ).r;
    const oldId = before.questions[0].id;
    await db.query('select public.save_answer($1,$2,$3,false)', [a, oldId, '["a"]']);
    await actor(admin);
    const authored = (
      await one<{ r: { questions: Record<string, unknown>[] } }>(
        'select public.author_exam($1) r',
        [e],
      )
    ).r;
    const updated = {
      ...authored.questions[0],
      content: 'Nội dung bản 2',
      points: 9,
      correct_ids: ['b'],
      options: [...original.options].reverse(),
      attachments: [{ path: `${admin}/questions/v2.png`, caption: 'Hình mới' }],
    };
    const requestId = crypto.randomUUID();
    const save = () =>
      db.query('select public.save_exam($1,$2,$3)', [
        JSON.stringify({
          ...payload,
          base_version: 1,
          request_id: requestId,
          schedule_scope: 'future',
        }),
        JSON.stringify([updated]),
        e,
      ]);
    await save();
    await save();
    const current = (
      await one<{ r: { version: number; questions: { json_source: typeof source }[] } }>(
        'select public.author_exam($1) r',
        [e],
      )
    ).r;
    expect(current.version).toBe(2);
    expect(current.questions[0].json_source).toEqual(source);
    await expect(
      db.query('select public.save_exam($1,$2,$3)', [
        JSON.stringify({ ...payload, base_version: 1 }),
        JSON.stringify([updated]),
        e,
      ]),
    ).rejects.toThrow(/bản sửa mới/);
    await actor(student);
    const after = (await one<{ r: typeof before }>('select public.get_attempt($1) r', [a])).r;
    expect(after.questions).toEqual(before.questions);
    expect(after.deadline).toBe(before.deadline);
    expect(after.option_order).toEqual(before.option_order);
    expect(after.question_order).toEqual(before.question_order);
    expect(after.exam_version).toBe(1);
    expect(
      (
        await one<{ r: boolean }>('select public.can_read_classroom_image($1) r', [
          `${admin}/questions/v1.png`,
        ])
      ).r,
    ).toBe(true);
    expect(
      (
        await one<{ r: boolean }>('select public.can_read_classroom_image($1) r', [
          `${admin}/questions/v2.png`,
        ])
      ).r,
    ).toBe(false);
    await db.query('select public.submit_attempt($1)', [a]);
    const result = (
      await one<{ r: { score: { score: number }; review: { content: string; points: number }[] } }>(
        'select public.attempt_result($1) r',
        [a],
      )
    ).r;
    expect(Number(result.score.score)).toBe(10);
    expect(result.review[0].content).toBe('Nội dung bản 1');
    expect(Number(result.review[0].points)).toBe(2);
    const b = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const fresh = (
      await one<{
        r: { questions: { id: string; content: string; points: number }[]; exam_version: number };
      }>('select public.get_attempt($1) r', [b])
    ).r;
    expect(fresh.exam_version).toBe(2);
    expect(fresh.questions[0].content).toBe('Nội dung bản 2');
    expect(Number(fresh.questions[0].points)).toBe(9);
    await db.query('select public.save_answer($1,$2,$3,false)', [
      b,
      fresh.questions[0].id,
      '["b"]',
    ]);
    await db.query('select public.submit_attempt($1)', [b]);
    expect(
      Number(
        (await one<{ r: { score: { score: number } } }>('select public.attempt_result($1) r', [b]))
          .r.score.score,
      ),
    ).toBe(10);
    await expect(db.query('select * from private.attempt_snapshots')).rejects.toThrow(
      /permission denied/,
    );
    await actor(admin);
    await db.exec('reset role');
    await expect(
      db.query("update private.attempt_snapshots set exam='{}' where attempt_id=$1", [a]),
    ).rejects.toThrow(/bất biến/);
  });
  test('lịch future giữ hạn cũ; active tính theo bắt đầu, không sửa lượt đã nộp và rút ngắn hết hạn ngay', async () => {
    await actor(admin);
    const payload = { ...exam(), max_attempts: 3, duration_minutes: 60 };
    const e = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify(payload),
        JSON.stringify(questions),
      ])
    ).id;
    await actor(student);
    const submitted = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    await db.query('select public.submit_attempt($1)', [submitted]);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const old = await one<{ deadline: Date; started_at: Date }>(
      'select deadline,started_at from public.attempts where id=$1',
      [a],
    );
    const closed = await one(
      'select deadline,submitted_at,status from public.attempts where id=$1',
      [submitted],
    );
    await actor(admin);
    const save = (extra: Record<string, unknown>) =>
      db.query('select public.save_exam($1,$2,$3)', [
        JSON.stringify({ ...payload, ...extra }),
        JSON.stringify(questions),
        e,
      ]);
    await save({ duration_minutes: 120, schedule_scope: 'future' });
    await actor(student);
    expect((await one('select deadline from public.attempts where id=$1', [a])).deadline).toEqual(
      old.deadline,
    );
    await actor(admin);
    await save({ duration_minutes: 120, schedule_scope: 'active' });
    await actor(student);
    const clock = (
      await one<{ r: { deadline: string; timing_revision: number } }>(
        'select public.attempt_clock($1) r',
        [a],
      )
    ).r;
    expect(Date.parse(clock.deadline)).toBe(new Date(old.started_at).getTime() + 120 * 60000);
    expect(clock.timing_revision).toBe(1);
    await expect(db.query('select public.submit_attempt($1)', [a])).rejects.toThrow(/Lịch làm bài/);
    await expect(db.query('select public.submit_attempt($1,0)', [a])).rejects.toThrow(
      /Lịch làm bài/,
    );
    expect(
      await one('select deadline,submitted_at,status from public.attempts where id=$1', [
        submitted,
      ]),
    ).toEqual(closed);
    await actor(admin);
    const past = new Date(Date.now() - 60000).toISOString();
    const preview = (
      await one<{ r: { active_count: number; expire_now: number } }>(
        'select public.preview_exam_schedule($1,$2,$3,$4) r',
        [e, null, null, past],
      )
    ).r;
    expect(preview.active_count).toBe(1);
    expect(preview.expire_now).toBe(1);
    await save({ duration_minutes: null, closes_at: past, schedule_scope: 'active' });
    await actor(student);
    const expired = await one<{ status: string; submitted_at: Date; deadline: Date }>(
      'select status,submitted_at,deadline from public.attempts where id=$1',
      [a],
    );
    expect(expired.status).toBe('expired');
    expect(expired.submitted_at).toEqual(expired.deadline);
    await actor(admin);
    await save({ duration_minutes: null, closes_at: null, schedule_scope: 'active' });
    await actor(student);
    expect(
      await one('select status,submitted_at,deadline from public.attempts where id=$1', [a]),
    ).toEqual(expired);
    await actor(unverified);
    await expect(
      db.query('select public.preview_exam_schedule($1,null,null,null)', [e]),
    ).rejects.toThrow(/quyền/);
  });
  test('deadline null xuyên save/read/clock/cron/submit; có giờ đóng dùng đúng giờ đóng', async () => {
    await actor(admin);
    const payload = { ...exam(), duration_minutes: null, max_attempts: 2 };
    const e = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify(payload),
        JSON.stringify(questions),
      ])
    ).id;
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    expect(
      (await one<{ r: { deadline: null } }>('select public.get_attempt($1) r', [a])).r.deadline,
    ).toBeNull();
    expect(
      (await one<{ r: { deadline: null } }>('select public.attempt_clock($1) r', [a])).r.deadline,
    ).toBeNull();
    await db.exec('reset role');
    await db.query('select private.expire_attempts()');
    await actor(student);
    expect((await one('select status from public.attempts where id=$1', [a])).status).toBe(
      'in_progress',
    );
    const q = (
      await one<{ r: { questions: { id: string }[] } }>('select public.get_attempt($1) r', [a])
    ).r.questions[0];
    await db.query('select public.save_answer($1,$2,$3,false)', [a, q.id, '["a","b"]']);
    await db.query('select public.submit_attempt($1)', [a]);
    const closed = await one(
      'select submitted_at,status,deadline from public.attempts where id=$1',
      [a],
    );
    expect(closed.status).toBe('submitted');
    expect(closed.submitted_at).not.toBeNull();
    expect(closed.deadline).toBeNull();
    const closes = new Date(Date.now() + 1800000).toISOString();
    await actor(admin);
    await db.query('select public.save_exam($1,$2,$3)', [
      JSON.stringify({ ...payload, closes_at: closes }),
      JSON.stringify(questions),
      e,
    ]);
    await actor(student);
    const b = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    expect(
      Date.parse(
        (await one<{ r: { deadline: string } }>('select public.attempt_clock($1) r', [b])).r
          .deadline,
      ),
    ).toBe(Date.parse(closes));
    await actor(unverified);
    await expect(db.query('select public.attempt_clock($1)', [b])).rejects.toThrow(/quyền/);
  });
  test('tổng kết ba phần tách câu đúng đủ/ý đúng, bỏ trống không đúng và bảo vệ theo hai lịch công bố', async () => {
    await actor(admin);
    const single = { ...questions[0], kind: 'single', section: 1, correct_ids: ['a'], points: 1 };
    const group = {
      ...questions[0],
      kind: 'boolean_group',
      section: 2,
      points: 4,
      options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: 'Nhận định ' + id })),
      correct_ids: ['a:true', 'b:false', 'c:true', 'd:false'],
      scoring_mode: 'per_statement',
    };
    const short = {
      ...questions[0],
      kind: 'short',
      section: 3,
      points: 1,
      options: [],
      correct_ids: [],
      short_answer: { mode: 'numeric', accepted: ['-1.25'], tolerance: '0', case_sensitive: false },
    };
    const all = [single, group, { ...group, id: 'blank' }, short, { ...short, id: 'blank-short' }];
    const payload = { ...exam(), shuffle_questions: false };
    const e = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify(payload),
        JSON.stringify(all),
      ])
    ).id;
    await actor(student);
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const qs = (
      await one<{ r: { questions: { id: string }[] } }>('select public.get_attempt($1) r', [a])
    ).r.questions;
    for (const [i, answer] of [
      [0, ['a']],
      [1, ['a:true', 'b:false', 'c:true']],
      [3, [' - 1,2500 ']],
    ] as [number, string[]][])
      await db.query('select public.save_answer($1,$2,$3,false)', [
        a,
        qs[i].id,
        JSON.stringify(answer),
      ]);
    await db.query('select public.submit_attempt($1)', [a]);
    let result = (
      await one<{ r: { score: { score: number }; section_summary: unknown[] } }>(
        'select public.attempt_result($1) r',
        [a],
      )
    ).r;
    expect(result.section_summary).toEqual([
      { section: 1, correct: 1, question_count: 1, statement_correct: 0, statement_total: 0 },
      { section: 2, correct: 0, question_count: 2, statement_correct: 3, statement_total: 8 },
      { section: 3, correct: 1, question_count: 2, statement_correct: 0, statement_total: 0 },
    ]);
    expect(Number(result.score.score)).toBe(4.55);
    await actor(admin);
    await db.exec('reset role');
    await db.query("update public.exams set answer_release='never' where id=$1", [e]);
    await actor(student);
    const hidden = (
      await one<{ r: Record<string, unknown> }>('select public.attempt_result($1) r', [a])
    ).r;
    expect(hidden.section_summary).toBeUndefined();
    expect(hidden.review).toBeUndefined();
    expect(hidden.score).not.toHaveProperty('correct');
    expect(hidden.score).not.toHaveProperty('sections');
    const report = (
      await one<{ r: { rows: { score: Record<string, unknown> }[] } }>(
        'select public.result_report_page($1,1,10) r',
        [JSON.stringify({ exam_id: e })],
      )
    ).r;
    expect(report.rows[0].score).not.toHaveProperty('correct');
    expect(report.rows[0].score).not.toHaveProperty('sections');
    await actor(admin);
    result = (await one<{ r: typeof result }>('select public.attempt_result($1) r', [a])).r;
    expect(result.section_summary).toHaveLength(3);
    await db.exec('reset role');
    await db.query(
      "update public.exams set answer_release='after_submit',score_release='never' where id=$1",
      [e],
    );
    await actor(student);
    const scoreHidden = (
      await one<{ r: Record<string, unknown> }>('select public.attempt_result($1) r', [a])
    ).r;
    expect(scoreHidden.score).toBeUndefined();
    expect(scoreHidden.section_summary).toBeUndefined();
  });
  test('hồ sơ phiên hiện hành: student/admin, phiên thu hồi/hết hạn/sai người và metadata role không có tác dụng', async () => {
    await actor(admin);
    await db.exec('reset role');
    const sid = crypto.randomUUID(),
      adminSid = crypto.randomUUID();
    await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)', [
      sid,
      student,
      adminSid,
      admin,
    ]);
    await actor(student);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ session_id: sid, role: 'admin' }),
    ]);
    const p = (await one<{ p: { id: string; role: string } }>('select public.current_profile() p'))
      .p;
    expect(p.id).toBe(student);
    expect(p.role).toBe('student');
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ session_id: adminSid }),
    ]);
    await expect(db.query('select public.current_profile()')).rejects.toThrow(/Phiên/);
    await actor(admin);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ session_id: adminSid }),
    ]);
    expect((await one<{ p: { role: string } }>('select public.current_profile() p')).p.role).toBe(
      'admin',
    );
    await db.exec('reset role');
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [
      sid,
    ]);
    await actor(student);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ session_id: sid }),
    ]);
    await expect(db.query('select public.current_profile()')).rejects.toThrow(/Phiên/);
    await db.exec('reset role');
    await db.query('delete from auth.sessions where id=$1', [sid]);
    await actor(student);
    await expect(db.query('select public.current_profile()')).rejects.toThrow(/Phiên/);
    await db.query("select set_config('request.jwt.claims','{}',false)");
    await expect(db.query('select public.current_profile()')).rejects.toThrow(/Phiên/);
  });
  test('lớp lưu trữ chặn lượt mới; xóa thành viên thu hồi quyền xem lớp và lịch sử', async () => {
    const id = await createExam();
    await actor(admin);
    await db.query('update public.classes set archived=true where id=$1', [cid]);
    await actor(student);
    await expect(db.query('select public.start_attempt($1)', [id])).rejects.toThrow(
      /Không được phép/,
    );
    await actor(admin);
    await db.query('delete from public.memberships where class_id=$1 and user_id=$2', [
      cid,
      student,
    ]);
    await actor(student);
    expect((await db.query('select id from public.classes')).rows).toHaveLength(0);
    expect((await db.query('select id from public.attempts')).rows).toHaveLength(0);
    await expect(db.query('select public.attempt_result($1)', [aid])).rejects.toThrow(
      /Không có quyền/,
    );
    await actor(admin);
    expect(
      (await one<{ r: Record<string, unknown> }>('select public.attempt_result($1) r', [aid])).r
        .score,
    ).toBeDefined();
  });
});

describe('Chuyển lớp của đề giữ lớp gốc từng lượt', () => {
  test('chuyển cùng ID; giữ bài cũ, điểm, ảnh và quyền; lớp mới chỉ tạo lượt mới', async () => {
    await actor(admin);
    const source = (
      await one<{ id: string }>(
        "insert into public.classes(name,school_year) values('Nguồn chuyển đề','2026') returning id",
      )
    ).id;
    const dest = (
      await one<{ id: string }>(
        "insert into public.classes(name,school_year) values('Nhận chuyển đề','2026') returning id",
      )
    ).id;
    const srcInvite = (
      await one<{ r: { token: string } }>("select public.manage_invite($1,'create') r", [source])
    ).r;
    const dstInvite = (
      await one<{ r: { token: string } }>("select public.manage_invite($1,'create') r", [dest])
    ).r;
    await actor(student);
    await db.query('select public.join_class($1)', [srcInvite.token]);
    await actor(other);
    await db.query('select public.join_class($1)', [dstInvite.token]);
    const image = `${admin}/questions/move-example.png`,
      q = {
        ...questions[1],
        kind: 'single',
        attachments: [{ path: image, caption: 'Hình gốc', purpose: 'illustration' }],
      };
    const cfg = {
      ...exam(),
      class_id: source,
      duration_minutes: null,
      max_attempts: 2,
      practice_enabled: true,
    };
    await actor(admin);
    const e = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify(cfg),
        JSON.stringify([q]),
      ])
    ).id;
    await actor(student);
    const submitted = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const first = (
      await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [
        submitted,
      ])
    ).r;
    await db.query('select public.save_answer($1,$2,$3,false)', [
      submitted,
      first.questions[0].id,
      JSON.stringify(['t']),
    ]);
    await db.query('select public.submit_attempt($1)', [submitted]);
    const active = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const practice = (
      await one<{ id: string }>("select public.start_mode_attempt($1,'practice') id", [e])
    ).id;
    await actor();
    const before = (
      await one<{ hash: string }>(
        "select md5(string_agg(to_jsonb(s)::text,'|' order by attempt_id)) hash from private.attempt_snapshots s where attempt_id=any($1::uuid[])",
        [[submitted, active, practice]],
      )
    ).hash;
    await actor(admin);
    const request = crypto.randomUUID();
    const payload = { ...cfg, class_id: dest, request_id: request };
    expect(
      (
        await one<{ id: string }>('select public.save_exam($1,$2,$3) id', [
          JSON.stringify(payload),
          JSON.stringify([{ ...q, content: 'Nội dung của lớp nhận' }]),
          e,
        ])
      ).id,
    ).toBe(e);
    expect(
      await one<{ class_id: string; version: number }>(
        'select class_id,version from public.exams where id=$1',
        [e],
      ),
    ).toEqual({ class_id: dest, version: 2 });
    await db.query('select public.save_exam($1,$2,$3)', [
      JSON.stringify({ ...payload, class_id: source }),
      JSON.stringify([q]),
      e,
    ]);
    expect(
      (await one<{ class_id: string }>('select class_id from public.exams where id=$1', [e]))
        .class_id,
    ).toBe(dest);
    await actor(student);
    expect((await db.query('select id from public.exams where id=$1', [e])).rows).toHaveLength(0);
    const old = (
      await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [
        active,
      ])
    ).r;
    expect(old.class_id).toBe(source);
    expect(old.can_open_exam).toBe(false);
    expect(old.questions[0].content).toBe(q.content);
    expect(old.deadline).toBeNull();
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [image])).ok,
    ).toBe(true);
    expect(
      JSON.stringify(
        (await one<{ r: unknown }>('select public.attempt_image_manifest($1) r', [active])).r,
      ),
    ).toContain(image);
    await db.query('select public.save_answer($1,$2,$3,false)', [
      active,
      old.questions[0].id,
      JSON.stringify(['t']),
    ]);
    await db.query('select public.submit_attempt($1)', [active]);
    await db.query('select public.check_practice_question($1,$2,$3,$4)', [
      practice,
      old.questions[0].id,
      JSON.stringify(['t']),
      crypto.randomUUID(),
    ]);
    const result = (
      await one<{ r: import('../src/types').Result }>('select public.attempt_result($1) r', [
        submitted,
      ])
    ).r;
    expect(result.class_id).toBe(source);
    expect(Number(result.score?.score)).toBe(10);
    expect(result.can_open_exam).toBe(false);
    const srcReport = (
      await one<{ r: { rows: import('../src/types').Result[] } }>(
        'select public.result_report_page($1,1,10) r',
        [JSON.stringify({ class_id: source, exam_id: e })],
      )
    ).r;
    expect(srcReport.rows).toHaveLength(2);
    expect(srcReport.rows.every((r) => r.class_id === source)).toBe(true);
    await expect(db.query('select public.start_attempt($1)', [e])).rejects.toThrow(
      /Không được phép/,
    );
    await actor(other);
    await expect(db.query('select public.get_attempt($1)', [active])).rejects.toThrow(
      /Không có quyền/,
    );
    expect(
      (await one<{ ok: boolean }>('select public.can_read_classroom_image($1) ok', [image])).ok,
    ).toBe(false);
    const newAttempt = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const current = (
      await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [
        newAttempt,
      ])
    ).r;
    expect(current.class_id).toBe(dest);
    expect(current.questions[0].content).toBe('Nội dung của lớp nhận');
    expect(current.exam_version).toBe(2);
    await actor(student);
    await expect(db.query('select public.get_attempt($1)', [newAttempt])).rejects.toThrow(
      /Không có quyền/,
    );
    await db.query('select public.join_class($1)', [dstInvite.token]);
    const ownNew = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    expect(ownNew).not.toBe(active);
    expect(
      (
        await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [
          ownNew,
        ])
      ).r.class_id,
    ).toBe(dest);
    await actor();
    expect(
      (
        await one<{ hash: string }>(
          "select md5(string_agg(to_jsonb(s)::text,'|' order by attempt_id)) hash from private.attempt_snapshots s where attempt_id=any($1::uuid[])",
          [[submitted, active, practice]],
        )
      ).hash,
    ).toBe(before);
    await expect(
      db.query('update public.attempts set class_id=$1 where id=$2', [dest, active]),
    ).rejects.toThrow(/Không đổi lớp gốc/);
  });
  test('chuyển đề chưa có lượt, chặn lớp không tồn tại/lưu trữ và người không phải admin', async () => {
    await actor(admin);
    const a = (
        await one<{ id: string }>(
          "insert into public.classes(name,school_year) values('Lớp A chuyển nháp','2026') returning id",
        )
      ).id,
      b = (
        await one<{ id: string }>(
          "insert into public.classes(name,school_year) values('Lớp B chuyển nháp','2026') returning id",
        )
      ).id,
      c = (
        await one<{ id: string }>(
          "insert into public.classes(name,school_year,archived) values('Lớp lưu trữ','2026',true) returning id",
        )
      ).id;
    const cfg = { ...exam(), class_id: a, status: 'draft' };
    const e = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify(cfg),
        JSON.stringify(questions),
      ])
    ).id;
    for (const invalid of [c, crypto.randomUUID()])
      await expect(
        db.query('select public.save_exam($1,$2,$3)', [
          JSON.stringify({ ...cfg, class_id: invalid }),
          JSON.stringify(questions),
          e,
        ]),
      ).rejects.toThrow(/Lớp nhận đề/);
    await db.query('select public.save_exam($1,$2,$3)', [
      JSON.stringify({ ...cfg, class_id: b }),
      JSON.stringify(questions),
      e,
    ]);
    expect(
      (await one<{ class_id: string }>('select class_id from public.exams where id=$1', [e]))
        .class_id,
    ).toBe(b);
    await actor(other);
    await expect(
      db.query('select public.save_exam($1,$2,$3)', [
        JSON.stringify({ ...cfg, class_id: a }),
        JSON.stringify(questions),
        e,
      ]),
    ).rejects.toThrow(/quản trị/);
  });
});

describe('Thẻ đề, lịch sử cá nhân và xem lại snapshot', () => {
  test('xem lại giữ thứ tự/snapshot, ẩn đáp án trước lịch và không lộ lượt người khác', async () => {
    await actor(admin);
    const c = (
      await one<{ id: string }>(
        "insert into public.classes(name,school_year) values('QA review','2026') returning id",
      )
    ).id;
    const invitation = (
      await one<{ r: { token: string } }>("select public.manage_invite($1,'create') r", [c])
    ).r;
    const image = `${admin}/questions/review.png`,
      solution = `${admin}/questions/secret-solution.png`;
    const cfg = {
      ...exam('never'),
      class_id: c,
      duration_minutes: null,
      max_attempts: 5,
      practice_enabled: true,
      result_method: 'counts',
    };
    const qs = [
      {
        ...questions[0],
        kind: 'single',
        section: 1,
        correct_ids: ['a'],
        content: 'Gốc $\\frac{1}{2}$',
        attachments: [
          { path: image, caption: 'Hình', placement: 'right', target_id: 'a' },
          { path: solution, caption: 'SECRET_SOLUTION', purpose: 'solution' },
        ],
      },
      {
        ...questions[0],
        id: 'group',
        kind: 'boolean_group',
        section: 2,
        options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Nhận định ${id}` })),
        correct_ids: ['a:true', 'b:false', 'c:true', 'd:false'],
      },
      {
        ...questions[0],
        id: 'short',
        kind: 'short',
        section: 3,
        options: [],
        correct_ids: [],
        short_answer: {
          mode: 'numeric',
          accepted: ['-1.5'],
          tolerance: '0.1',
          case_sensitive: false,
        },
      },
      { ...questions[0], id: 'blank', kind: 'single', section: 1, correct_ids: ['a'] },
    ];
    const e = (
      await one<{ id: string }>('select public.save_exam($1,$2) id', [
        JSON.stringify(cfg),
        JSON.stringify(qs),
      ])
    ).id;
    await actor(student);
    await db.query('select public.join_class($1)', [invitation.token]);
    const counts = (
      await one<{ r: Record<string, number> }>('select public.exam_card_counts($1) r', [
        [e, crypto.randomUUID()],
      ])
    ).r;
    expect(counts).toEqual({ [e]: 4 });
    const a = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    const live = (
      await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [a])
    ).r;
    const single = live.questions.find((q) => q.content.startsWith('Gốc'))!,
      group = live.questions.find((q) => q.kind === 'boolean_group')!,
      short = live.questions.find((q) => q.kind === 'short')!;
    for (const [q, answer] of [
      [single, ['b']],
      [group, ['a:true', 'b:false', 'c:true']],
      [short, [' -1,50 ']],
    ] as const)
      await db.query('select public.save_answer($1,$2,$3,false)', [
        a,
        q.id,
        JSON.stringify(answer),
      ]);
    await db.query('select public.submit_attempt($1)', [a]);
    const hidden = (
      await one<{ r: import('../src/types').Result }>('select public.attempt_review($1) r', [a])
    ).r;
    expect(hidden.question_order).toEqual(live.question_order);
    expect(hidden.option_order).toEqual(live.option_order);
    expect(hidden.review_questions).toHaveLength(4);
    for (const q of hidden.review_questions!) {
      expect(q).not.toHaveProperty('correct_ids');
      expect(q).not.toHaveProperty('short_answer');
      expect(q).not.toHaveProperty('explanation');
      expect(q).not.toHaveProperty('review_status');
      expect(q).not.toHaveProperty('statement_correct');
    }
    expect(JSON.stringify(hidden)).not.toContain('SECRET_SOLUTION');
    expect(
      JSON.stringify(
        (await one<{ r: unknown }>("select public.attempt_image_manifest($1,'result') r", [a])).r,
      ),
    ).not.toContain(solution);
    const history = (
      await one<{ r: { rows: import('../src/types').Result[]; total: number } }>(
        'select public.exam_attempt_history($1) r',
        [e],
      )
    ).r;
    expect(history.total).toBe(1);
    expect(history.rows[0]).not.toHaveProperty('answers');
    expect(history.rows[0]).not.toHaveProperty('score');
    await actor(other);
    await expect(db.query('select public.attempt_review($1)', [a])).rejects.toThrow(/quyền/);
    expect(
      (await one<{ r: { total: number } }>('select public.exam_attempt_history($1) r', [e])).r
        .total,
    ).toBe(0);
    expect((await one<{ r: object }>('select public.exam_card_counts($1) r', [[e]])).r).toEqual({});
    await actor(admin);
    await db.query('select public.save_exam($1,$2,$3)', [
      JSON.stringify({ ...cfg, answer_release: 'after_submit', expected_version: 1 }),
      JSON.stringify(qs.map((q) => ({ ...q, content: 'ĐỀ MỚI' }))),
      e,
    ]);
    await actor(student);
    const shown = (
      await one<{ r: import('../src/types').Result }>('select public.attempt_review($1) r', [a])
    ).r;
    expect(shown.exam_version).toBe(1);
    expect(shown.question_order).toEqual(live.question_order);
    expect(shown.option_order).toEqual(live.option_order);
    expect(shown.review_questions!.find((q) => q.id === single.id)).toMatchObject({
      content: single.content,
      review_status: 'wrong',
    });
    expect(shown.review_questions!.find((q) => q.id === group.id)).toMatchObject({
      review_status: 'wrong',
      statement_correct: 3,
    });
    expect(shown.review_questions!.find((q) => q.id === short.id)?.review_status).toBe('correct');
    expect(shown.review_questions!.filter((q) => q.review_status === 'blank')).toHaveLength(1);
    const next = (await one<{ id: string }>('select public.start_attempt($1) id', [e])).id;
    expect(next).not.toBe(a);
    expect(
      (
        await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [
          next,
        ])
      ).r.questions.every((q) => q.content === 'ĐỀ MỚI'),
    ).toBe(true);
    expect((await one<{ id: string }>('select public.start_attempt($1) id', [e])).id).toBe(next);
    expect(
      (await one<{ r: import('../src/types').Result }>('select public.attempt_review($1) r', [a])).r
        .answers,
    ).toEqual(shown.answers);
    const p = (await one<{ id: string }>("select public.start_mode_attempt($1,'practice') id", [e]))
      .id;
    const plive = (
      await one<{ r: import('../src/types').AttemptData }>('select public.get_attempt($1) r', [p])
    ).r;
    const pq = plive.questions.find((q) => q.kind === 'short')!;
    await db.query('select public.check_practice_question($1,$2,$3,$4)', [
      p,
      pq.id,
      JSON.stringify(['-1.5']),
      crypto.randomUUID(),
    ]);
    await db.query('select public.finish_practice($1)', [p]);
    const pr = (
      await one<{ r: import('../src/types').Result }>('select public.attempt_review($1) r', [p])
    ).r;
    expect(pr.review_questions!.filter((q) => q.review_status !== undefined)).toHaveLength(1);
    expect(pr.review_questions!.find((q) => q.id === pq.id)?.review_status).toBe('correct');
    await actor();
    await db.query('delete from private.attempt_snapshots where attempt_id=$1', [p]);
    await actor(student);
    const missing = (
      await one<{ r: import('../src/types').Result }>('select public.attempt_review($1) r', [p])
    ).r;
    expect(missing.snapshot_missing).toBe(true);
    expect(missing.review_questions).toEqual([]);
  });
});
