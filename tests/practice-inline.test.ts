import { describe, expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionResponse } from '@/features/attempts/question-response';
import { PracticeQuestionFeedback } from '@/features/practice/question-feedback';
import type { PracticeFeedback, Question } from '@/types';

const question: Question = {
  id: 'q',
  position: 1,
  kind: 'single',
  content: 'Nội dung gốc',
  points: 1,
  options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Phương án ${id}` })),
};
function feedback(q: Question, selected: string[], correct = false): PracticeFeedback {
  return {
    check_id: 1,
    selected,
    correct,
    statement_correct: 0,
    checked_at: '2026-11-07T00:00:00Z',
    question: q,
  };
}
function response(q: Question, selected: string[], result?: PracticeFeedback, practiceMode = true) {
  return renderToStaticMarkup(
    createElement(QuestionResponse, {
      question: q,
      answer: selected,
      order: q.options.map((o) => o.id),
      disabled: !!result,
      onChange: () => {},
      practiceMode,
      feedback: result,
    }),
  );
}
describe('Practice feedback on original controls', () => {
  test('one set of options: correct A green, selected C red, others neutral', () => {
    const html = response(question, ['c'], feedback({ ...question, correct_ids: ['a'] }, ['c']));
    expect(html.match(/class="answer-option /g)).toHaveLength(4);
    expect(html.match(/practice-correct/g)).toHaveLength(1);
    expect(html.match(/practice-wrong/g)).toHaveLength(1);
    expect(html).toMatch(/practice-correct[\s\S]*?Phương án a/);
    expect(html).toMatch(/practice-wrong[\s\S]*?Phương án c/);
    expect(html).toContain('aria-label="Đáp án đúng"');
    expect(html).toContain('aria-label="Lựa chọn sai"');
  });
  test('stable IDs support multiple correct options independently of display order', () => {
    const q = {
      ...question,
      kind: 'multiple' as const,
      options: [...question.options].reverse(),
      correct_ids: ['a', 'd'],
    };
    const html = response(q, ['a', 'b'], feedback(q, ['a', 'b']));
    expect(html.match(/practice-correct/g)).toHaveLength(2);
    expect(html.match(/practice-wrong/g)).toHaveLength(1);
    expect(html.indexOf('Phương án d')).toBeLessThan(html.indexOf('Phương án a'));
  });
  test('truth feedback keeps all eight radios and original four statements', () => {
    const q = {
      ...question,
      kind: 'boolean_group' as const,
      correct_ids: ['a:true', 'b:false', 'c:true', 'd:false'],
    };
    const selected = ['a:true', 'b:true', 'c:true', 'd:false'];
    const html = response(q, selected, feedback(q, selected));
    expect(html.match(/type="radio"/g)).toHaveLength(8);
    expect(html.match(/truth-correct/g)).toHaveLength(4);
    expect(html.match(/truth-wrong/g)).toHaveLength(1);
    expect(html.match(/Phương án b/g)).toHaveLength(1);
    expect(html).toContain('Lựa chọn sai Ý b: Đúng');
    expect(html).toContain('Đáp án đúng Ý b: Sai');
    expect(html).not.toContain('truth-review-cell');
  });
  test('short response keeps exact input and shows server accepted answer only if wrong', () => {
    const q: Question = {
      ...question,
      kind: 'short',
      options: [],
      short_answer: { mode: 'numeric', accepted: ['-1.5'], tolerance: '0', case_sensitive: false },
    };
    const wrong = response(q, [' 7,50 '], feedback(q, [' 7,50 ']));
    expect(wrong).toContain('value=" 7,50 "');
    expect(wrong).toContain('practice-short-wrong');
    expect(wrong).toContain('Đáp án đúng:');
    expect(wrong).toContain('-1.5');
    const correct = response(q, [' -1,50 '], feedback(q, [' -1,50 '], true));
    expect(correct).toContain('practice-short-correct');
    expect(correct).not.toContain('Đáp án đúng:');
  });
  test('exam mode does not expose practice feedback or accepted answers', () => {
    const html = response(
      question,
      ['c'],
      feedback({ ...question, correct_ids: ['a'] }, ['c']),
      false,
    );
    expect(html).not.toContain('practice-correct');
    expect(html).not.toContain('practice-wrong');
    expect(html).not.toContain('practice-option-indicator');
  });
  test('feedback controls never render another copy of question/options', () => {
    const html = renderToStaticMarkup(
      createElement(PracticeQuestionFeedback, {
        feedback: feedback({ ...question, explanation: 'Giải thích riêng' }, ['c']),
        busy: false,
        complete: true,
        kind: 'single',
        onCheck: () => {},
        onRetry: () => {},
      }),
    );
    expect(html).toContain('Xem lời giải');
    expect(html).not.toContain('Phương án');
    expect(html).not.toContain('Nội dung gốc');
    expect(html).not.toContain('Giải thích riêng');
  });
});
