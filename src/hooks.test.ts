import { describe, it, expect } from 'vitest';
import * as ExamHooks from './hooks/courses/exams';

describe('Exam Hooks Import Sanity', () => {
  it('should import exam hooks', () => {
    expect(ExamHooks).toBeDefined();
  });
});
