export type Profile = {
  id: string;
  full_name: string;
  role: 'admin' | 'student';
  avatar_path: string | null;
};
export type Classroom = {
  id: string;
  name: string;
  description: string;
  school_year: string;
  cover_path: string | null;
  archived: boolean;
  created_at: string;
};
export type Release = 'after_submit' | 'after_close' | 'never';
export type ResultMethod = 'legacy' | 'thpt' | 'counts';
export type SectionCount = {
  section: number;
  correct: number;
  question_count: number;
  statement_correct: number;
  statement_total: number;
  checked?: number;
};
export type SectionScore = { section: number; score: number; max_score: number };
export type Exam = {
  result_method?: ResultMethod;
  exam_enabled?: boolean;
  practice_enabled?: boolean;
  id: string;
  class_id: string;
  title: string;
  description: string;
  instructions: string;
  status: 'draft' | 'published' | 'archived';
  duration_minutes: number | null;
  active_attempts?: number;
  opens_at: string | null;
  closes_at: string | null;
  max_attempts: number;
  score_method: 'highest' | 'latest';
  shuffle_questions: boolean;
  shuffle_options: boolean;
  score_release: Release;
  answer_release: Release;
  version: number;
};
export type DataTable = { id: string; caption: string; headers: string[]; rows: string[][] };
export type Figure = {
  purpose?: 'illustration' | 'question' | 'answer' | 'solution';
  path: string;
  caption: string;
  placement?: 'right' | 'below';
  target_id?: string;
};
export type FigureUrl = {
  key?: string;
  url: string;
  caption: string;
  placement?: 'right' | 'below';
  target_id?: string;
};
export type Question = {
  review_status?: 'correct' | 'wrong' | 'blank';
  statement_correct?: number;
  json_source?: {
    package_id: string;
    question_id: string;
    answer_origin: 'document' | 'ai' | 'teacher' | 'unconfirmed';
    confirmed: boolean;
  };
  id: string;
  position: number;
  kind: 'single' | 'multiple' | 'boolean' | 'boolean_group' | 'short';
  section?: 1 | 2 | 3;
  scoring_mode?: 'per_statement' | 'all_or_nothing';
  response_mode?: 'numeric' | 'text';
  content: string;
  image_path?: string | null;
  image_url?: string;
  image_figure?: FigureUrl;
  attachments?: Figure[];
  attachment_urls?: FigureUrl[];
  tables?: DataTable[];
  source_refs?: { image_id: string; page: number }[];
  import_key?: string | null;
  options: { id: string; text: string; tables?: DataTable[] }[];
  points: number;
  correct_ids?: string[];
  explanation?: string;
  short_answer?: {
    mode: 'numeric' | 'text';
    accepted: string[];
    tolerance: string;
    case_sensitive: boolean;
  } | null;
};
export type Attempt = {
  class_id?: string;
  can_open_exam?: boolean;
  mode?: 'exam' | 'practice';
  id: string;
  exam_id: string;
  user_id: string;
  started_at: string;
  deadline: string | null;
  exam_version?: number;
  timing_revision?: number;
  submitted_at: string | null;
  status: 'in_progress' | 'submitted' | 'expired';
  answers: Record<string, string[]>;
  flagged: string[];
  question_order: string[];
  option_order: Record<string, string[]>;
};
export type AttemptData = Attempt & {
  practice_checked_ids?: string[];
  practice_feedback?: Record<string, PracticeFeedback>;
  server_now: string;
  exam: {
    title: string;
    instructions: string;
    version?: number;
    duration_minutes?: number | null;
    result_method?: ResultMethod;
  };
  questions: Question[];
};
export type Score = {
  earned: number;
  total: number;
  score: number;
  correct: number;
  wrong: number;
  unanswered: number;
  sections?:
    | {
        section: number;
        earned: number;
        total: number;
        correct: number;
        wrong: number;
        unanswered: number;
      }[]
    | null;
};
export type Result = Attempt & {
  review_questions?: Question[];
  snapshot_missing?: boolean;
  result_method?: ResultMethod;
  result_available?: boolean;
  section_scores?: SectionScore[];
  practice_summary?: PracticeSection[];
  practice_history?: PracticeCheck[];
  section_summary?: {
    section: number;
    correct: number;
    question_count: number;
    statement_correct: number;
    statement_total: number;
  }[];
  exam_title: string;
  class_id: string;
  score?: Score;
  review?: Question[];
};
export type ActionState = { error?: string; success?: string };
export type PracticeCheck = {
  section?: number;
  question_number?: number;
  selected_text?: string[];
  id: number;
  question_id: string;
  selected: string[];
  correct: boolean;
  statement_correct: number;
  checked_at: string;
};
export type PracticeFeedback = {
  check_id: number;
  selected: string[];
  correct: boolean;
  statement_correct: number;
  checked_at: string;
  question: Question;
};
export type PracticeSection = {
  section: number;
  question_count: number;
  checked: number;
  first_correct: number;
  statement_correct: number;
  statement_total: number;
};
