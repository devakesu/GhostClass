import 'package:flutter/material.dart';
import 'package:ghostclass/logic/type_utils.dart';

String? _firstNonEmptyString(Map<String, dynamic> json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value is String && value.trim().isNotEmpty) {
      return value;
    }
  }
  return null;
}

double? _toDouble(dynamic value) {
  if (value == null) return null;
  if (value is double) return value;
  if (value is int) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

class Exam {
  final int id;
  final String name;
  final String? summary;
  final String activityType; // 'assessment' or 'assignment'
  final DateTime? startsAt;
  final DateTime? endsAt;
  final double? maximumMark;
  final double? apiScore;
  final List<Course> courses;

  Exam({
    required this.id,
    required this.name,
    required this.activityType, this.summary,
    this.startsAt,
    this.endsAt,
    this.maximumMark,
    this.apiScore,
    this.courses = const [],
  });

  factory Exam.fromJson(Map<String, dynamic> json) {
    final participants = json['participants'] as List? ?? [];
    double? pivotScore;
    if (participants.isNotEmpty) {
      final pivot = participants.first['pivot'] as Map<String, dynamic>?;
      pivotScore = _toDouble(pivot?['score']);
    }

    final coursesList = (json['course'] as List? ?? [])
        .map((c) => Course.fromJson(c as Map<String, dynamic>))
        .toList();

    return Exam(
      id: toInt(json['id']) ?? 0,
      name: json['name'] as String? ?? 'Untitled Exam',
      // Prefer historical EzyGo typo key first, fallback to corrected spelling.
      summary: _firstNonEmptyString(json, const ['summery', 'summary']),
      activityType: json['activity_type'] as String? ?? 'assessment',
      startsAt: json['starts_at'] != null ? DateTime.tryParse(json['starts_at'] as String) : null,
      endsAt: json['end_at'] != null ? DateTime.tryParse(json['end_at'] as String) : null,
      maximumMark: _toDouble(json['maximum_mark']) ?? _toDouble(json['settings']?['questionPaperMaximumMark']),
      apiScore: pivotScore,
      courses: coursesList,
    );
  }

  String get courseName {
    if (courses.isEmpty) return 'Unknown Course';
    final c = courses.first;
    return c.code != null ? '${c.code} – ${c.name}' : c.name;
  }

  DateTime? get date => startsAt ?? endsAt;
}

class Course {
  final int id;
  final String name;
  final String? code;
  final String? academicYear;
  final String? academicSemester;

  Course({required this.id, required this.name, this.code, this.academicYear, this.academicSemester});

  factory Course.fromJson(Map<String, dynamic> json) {
    return Course(
      id: toInt(json['id']) ?? 0,
      name: json['name'] as String? ?? 'Unknown',
      code: json['code'] as String?,
      academicYear: json['academic_year'] as String?,
      academicSemester: json['academic_semester'] as String?,
    );
  }
}

class ExamQuestion {
  final int id;
  final String questionNo;
  final double maximumMark;
  final int? subquestionParentId;
  final int? orQuestionGroupId;

  ExamQuestion({
    required this.id,
    required this.questionNo,
    required this.maximumMark,
    this.subquestionParentId,
    this.orQuestionGroupId,
  });

  factory ExamQuestion.fromJson(Map<String, dynamic> json) {
    return ExamQuestion(
      id: toInt(json['id']) ?? 0,
      questionNo: json['question_no'] as String? ?? '?',
      maximumMark: _toDouble(json['maximum_mark']) ?? 0.0,
      subquestionParentId: toInt(json['subquestion_parent_id']),
      orQuestionGroupId: toInt(json['orquestion_group_id']),
    );
  }
}

class ExamAnswer {
  final int id;
  final int examQuestionId;
  final double? score;

  ExamAnswer({
    required this.id,
    required this.examQuestionId,
    this.score,
  });

  factory ExamAnswer.fromJson(Map<String, dynamic> json) {
    return ExamAnswer(
      id: toInt(json['id']) ?? 0,
      examQuestionId: toInt(json['examquestion_id']) ?? 0,
      score: _toDouble(json['score']),
    );
  }
}

class ResolvedScore {
  final double score;
  final double maxMark;
  final bool isMarked;
  final bool isMaxUnresolvable;

  ResolvedScore({
    required this.score,
    required this.maxMark,
    required this.isMarked,
    this.isMaxUnresolvable = false,
  });

  double get percentage => (isMaxUnresolvable || maxMark <= 0) ? 0 : (score / maxMark) * 100;

  Color get color {
    if (!isMarked) return Colors.grey;
    if (isMaxUnresolvable) return Colors.blueGrey;
    if (percentage >= 75) return const Color(0xFF10B981); // emerald-500
    if (percentage >= 50) return const Color(0xFFF59E0B); // amber-500
    return const Color(0xFFEF4444); // red-500
  }
}
