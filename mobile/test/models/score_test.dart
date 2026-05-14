import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/score.dart';

void main() {
  group('Exam', () {
    test('fromJson prefers summery and derives scores from nested payloads', () {
      final exam = Exam.fromJson({
        'id': '88',
        'name': 'Midterm',
        'summery': 'Historical typo should win',
        'summary': 'Fallback summary',
        'activity_type': 'assignment',
        'starts_at': '2026-05-14T09:00:00Z',
        'end_at': '2026-05-14T11:00:00Z',
        'maximum_mark': null,
        'settings': {'questionPaperMaximumMark': 75},
        'participants': [
          {
            'pivot': {'score': '61.5'},
          },
        ],
        'course': [
          {
            'id': 3,
            'name': 'Physics',
            'code': 'PHY101',
          },
        ],
      });

      expect(exam.id, 88);
      expect(exam.summary, 'Historical typo should win');
      expect(exam.activityType, 'assignment');
      expect(exam.startsAt, DateTime.parse('2026-05-14T09:00:00Z'));
      expect(exam.endsAt, DateTime.parse('2026-05-14T11:00:00Z'));
      expect(exam.maximumMark, 75);
      expect(exam.apiScore, 61.5);
      expect(exam.courseName, 'PHY101 – Physics');
      expect(exam.date, DateTime.parse('2026-05-14T09:00:00Z'));
    });

    test('fromJson falls back to defaults when optional fields are absent', () {
      final exam = Exam.fromJson({'id': 1});

      expect(exam.id, 1);
      expect(exam.name, 'Untitled Exam');
      expect(exam.summary, isNull);
      expect(exam.activityType, 'assessment');
      expect(exam.startsAt, isNull);
      expect(exam.endsAt, isNull);
      expect(exam.maximumMark, isNull);
      expect(exam.apiScore, isNull);
      expect(exam.courseName, 'Unknown Course');
      expect(exam.date, isNull);
    });

    test('courseName falls back when course list is empty', () {
      var exam = Exam(
        id: 1,
        name: 'Quiz',
        activityType: 'assessment',
      );

      expect(exam.courseName, 'Unknown Course');
    });
  });

  group('Question and answer models', () {
    test('parses ids and mark values consistently', () {
      final question = ExamQuestion.fromJson({
        'id': '9',
        'question_no': 'Q1',
        'maximum_mark': '10.5',
        'subquestion_parent_id': 2.0,
        'orquestion_group_id': '4',
      });

      final answer = ExamAnswer.fromJson({
        'id': 11,
        'examquestion_id': '9',
        'score': 7,
      });

      expect(question.id, 9);
      expect(question.questionNo, 'Q1');
      expect(question.maximumMark, 10.5);
      expect(question.subquestionParentId, 2);
      expect(question.orQuestionGroupId, 4);
      expect(answer.id, 11);
      expect(answer.examQuestionId, 9);
      expect(answer.score, 7);
    });
  });

  group('ResolvedScore', () {
    test('maps score percentages to the expected colors', () {
      expect(
        ResolvedScore(score: 0, maxMark: 10, isMarked: false).color,
        Colors.grey,
      );
      expect(
        ResolvedScore(
          score: 80,
          maxMark: 100,
          isMarked: true,
        ).color,
        const Color(0xFF10B981),
      );
      expect(
        ResolvedScore(
          score: 50,
          maxMark: 100,
          isMarked: true,
        ).color,
        const Color(0xFFF59E0B),
      );
      expect(
        ResolvedScore(
          score: 40,
          maxMark: 100,
          isMarked: true,
        ).color,
        const Color(0xFFEF4444),
      );
      expect(
        ResolvedScore(
          score: 10,
          maxMark: 0,
          isMarked: true,
          isMaxUnresolvable: true,
        ).percentage,
        0,
      );
      expect(
        ResolvedScore(
          score: 10,
          maxMark: 100,
          isMarked: true,
          isMaxUnresolvable: true,
        ).color,
        Colors.blueGrey,
      );
    });
  });
}