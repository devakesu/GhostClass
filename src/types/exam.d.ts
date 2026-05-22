/**
 * Represents courses linked to an exam.
 */
export interface ExamCourse {
  id: number;
  si_no: number;
  name: string;
  code: string;
  department_course_code: string | null;
  start_year: string | null;
  institution_id: number;
  usersubgroup_id: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  academic_year: string;
  academic_semester: string;
  pre_requisites: string | null;
  ltp_credits: string | null;
  reference_docs: string | null;
  text_books: string | null;
  course_type_id: number;
  course_category_id: number | null;
  deleted_at: string | null;
  enable_laboratory: string | null;
  pivot: {
    exam_id: number;
    course_id: number;
  };
  usersubgroup: {
    id: number;
    si_no: string;
    name: string;
    description: string | null;
    code: string;
    scheme: string;
    type: string | null;
    end_date: string;
    start_date: string;
    start_year: string;
    usergroup_id: number;
    programme_config_group_id: number;
    institution_id: number;
    created_by: number;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
    academic_year: string;
    academic_semester: string;
    usergroup: {
      id: number;
      name: string;
      description: string | null;
      code: string;
      affiliated_university: string;
      scheme: string;
    };
  };
}

/**
 * Represents a participant in an exam (e.g., the logged-in student).
 */
export interface ExamParticipant {
  id: number;
  starts_at: string | null;
  end_at: string | null;
  exam_id: number;
  pivot: {
    exam_id: number;
    institution_user_id: number;
    starts_at: string | null;
    end_at: string | null;
    /** Achieved score (null = not yet graded / pending) */
    score: number | null;
    comments: string | null;
    absent_enable: number;
  };
}

/**
 * Optional exam configuration / question paper settings from EzyGo.
 */
export interface ExamSettings {
  slot_number?: string;
  questionPaperDate?: string;
  questionPaperTime?: string;
  questionPaperMaximumMark?: string;
  enableEvaluationScheme?: boolean;
  enabledHeadersCo?: boolean;
  enabledHeadersMark?: boolean;
  [key: string]: unknown;
}

/**
 * Represents a single graded answer for one exam question,
 * returned by GET /api/backend/exams/{id}/institutionuser/examanswers.
 */
export interface ExamAnswer {
  id: number;
  answer: string | null;
  /** String-formatted score, e.g. "5.000" */
  score: string | null;
  choice_id: number | null;
  examquestion_id: number;
  student_id: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  files: unknown[];
}

/**
 * Represents a single question in an exam,
 * returned by GET /api/backend/exams/{id}/examquestions?from_view_score=true.
 */
export interface ExamQuestion {
  id: number;
  question_no: string;
  name: string;
  question: Array<{ type: string; value: string | null }>;
  summary: string | null;
  difficulty_level: string | null;
  /** e.g. "Theory", "Problem/Design" */
  type: string;
  evaluation_scheme: unknown | null;
  allow_descriptive: number;
  allow_attachment_answer: number;
  answer_required: number;
  /** String-formatted max mark, e.g. "5.0" */
  maximum_mark: string;
  blooms_taxonamy_level: string | null;
  section_id: number | null;
  module_id: number;
  exam_id: number;
  institution_id: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  orquestion_group_id: number | null;
  subquestion_parent_id: number | null;
  files: unknown[];
  choices: unknown[];
  course_outcome: Array<{
    id: number;
    si_no: number;
    name: string;
    code: string;
    outcome: string;
    course_id: number;
    institution_id: number;
    created_by: number;
    created_at: string | null;
    updated_at: string | null;
    cognitive_levels: unknown[];
    pivot: { question_id: number; course_outcome_id: number };
  }>;
  programme_outcome: unknown[];
  programme_specific_outcome: unknown[];
}

/**
 * Represents a single exam / activity returned by GET /api/backend/exams.
 */
export interface Exam {
  id: number;
  name: string;
  activity_name_id: number | null;
  summary: string | null;
  starts_at: string | null;
  end_at: string | null;
  return_at: string | null;
  limitted_time_seconds: number | null;
  category_id: number | null;
  respond_after_close: number;
  /** "assessment" | "assignment" or other future types */
  activity_type: "assessment" | "assignment" | string;
  offline_activity: number;
  maximum_mark: number | null;
  negative_mark: number | null;
  positive_mark: number | null;
  hidden: number;
  is_objective_only: number;
  shuffle_questions: number;
  shuffle_choices: number;
  exclude_from_report: number;
  ordered_choice_list: number;
  auto_evaluation: number;
  publish_result: number;
  max_co_scores: number | null;
  co_score_evaluation: number;
  institution_id: number;
  settings: ExamSettings | null;
  course_id: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  course: ExamCourse[];
  activity_name: unknown | null;
  participants: ExamParticipant[];
}
