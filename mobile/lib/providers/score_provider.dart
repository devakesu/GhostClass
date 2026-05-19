import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/score.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/notification_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';

final scoreProvider = AsyncNotifierProvider<ScoreNotifier, ScoreState>(
  ScoreNotifier.new,
);

class ScoreState {
  ScoreState({
    required this.rawExams,
    required this.groupedExams,
    required this.questions,
    required this.answers,
    required this.resolvedScores,
    required this.filterType,
    required this.totalExams,
    required this.scoredCount,
    required this.pendingCount,
  });
  final List<Exam> rawExams;
  final List<CourseGroup> groupedExams;
  final Map<int, List<ExamQuestion>> questions;
  final Map<int, List<ExamAnswer>> answers;
  final Map<int, ResolvedScore> resolvedScores;
  final String filterType;
  final int totalExams;
  final int scoredCount;
  final int pendingCount;

  ScoreState copyWith({
    List<Exam>? rawExams,
    List<CourseGroup>? groupedExams,
    Map<int, List<ExamQuestion>>? questions,
    Map<int, List<ExamAnswer>>? answers,
    Map<int, ResolvedScore>? resolvedScores,
    String? filterType,
    int? totalExams,
    int? scoredCount,
    int? pendingCount,
  }) {
    return ScoreState(
      rawExams: rawExams ?? this.rawExams,
      groupedExams: groupedExams ?? this.groupedExams,
      questions: questions ?? this.questions,
      answers: answers ?? this.answers,
      resolvedScores: resolvedScores ?? this.resolvedScores,
      filterType: filterType ?? this.filterType,
      totalExams: totalExams ?? this.totalExams,
      scoredCount: scoredCount ?? this.scoredCount,
      pendingCount: pendingCount ?? this.pendingCount,
    );
  }
}

class CourseGroup {
  CourseGroup({required this.label, required this.exams});
  final String label;
  final List<Exam> exams;
}

class ScoreNotifier extends AsyncNotifier<ScoreState> {
  @override
  Future<ScoreState> build() async {
    final authState = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);
    final academic = academicAsync.value;

    // BLOCKER: Do not fire queries until Cron Sync is finished
    if (authState.value?.isSyncing == true) {
      // Return a future that will be replaced once isSyncing changes
      return Completer<ScoreState>().future;
    }

    return _initialFetch(academic: academic);
  }

  Future<ScoreState> _initialFetch({
    AcademicState? academic,
    bool bypassCache = false,
  }) async {
    final authState = ref.watch(authProvider);
    final user = authState.value;
    if (user == null) throw Exception('Unauthorized');

    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    try {
      final examsRes = await api.fetchExams(storage);

      if (examsRes.statusCode != 200 || examsRes.data is! List) {
        throw Exception(formatApiError(examsRes.data, 'Scores.Exams'));
      }

      final examsJson = examsRes.data as List<dynamic>;
      final allExams = examsJson
          .map((j) => Exam.fromJson(j as Map<String, dynamic>))
          .toList();

      // Only show exams where I am a participant
      final participatedExams = allExams.where((e) {
        // Some EzyGo responses omit participants but still belong to the user
        // We filter basically by "does it have course info" or "is it likely mine"
        return e.courses.isNotEmpty;
      }).toList();

      final questionsMap = <int, List<ExamQuestion>>{};
      final answersMap = <int, List<ExamAnswer>>{};
      final resolvedScores = <int, ResolvedScore>{};

      // Batch Resolve Details with small concurrency to avoid flooding APIs.
      const poolSize = 5;
      final targetExams = participatedExams.toList();
      for (var i = 0; i < targetExams.length; i += poolSize) {
        final slice = targetExams.skip(i).take(poolSize);
        await Future.wait(
          slice.map(
            (exam) => _loadExamDetails(
              exam: exam,
              api: api,
              storage: storage,
              questionsMap: questionsMap,
              answersMap: answersMap,
              resolvedScores: resolvedScores,
              bypassCache: bypassCache,
            ),
          ),
        );
      }

      // ─── Filter Visible Exams (Academic Context) ──────────────────────────
      final visibleExams = participatedExams.where((e) {
        if (!_matchesAcademic(e, academic)) return false;

        if (e.activityType == 'assignment') {
          final hasAnswers = (answersMap[e.id] ?? []).isNotEmpty;
          final hasScore = resolvedScores[e.id] != null;
          return hasAnswers || hasScore || e.apiScore != null;
        }
        return true;
      }).toList();

      final scored = visibleExams
          .where((e) => resolvedScores.containsKey(e.id))
          .length;
      final pending = visibleExams.length - scored;

      final state = ScoreState(
        rawExams: visibleExams,
        groupedExams: [],
        questions: questionsMap,
        answers: answersMap,
        resolvedScores: resolvedScores,
        filterType: 'all',
        totalExams: visibleExams.length,
        scoredCount: scored,
        pendingCount: pending,
      );

      return _applyFilter(state, 'all');
    } catch (e) {
      throw Exception('Failed to load internal marks: $e');
    }
  }

  ScoreState _applyFilter(ScoreState baseState, String type) {
    var filtered = baseState.rawExams;
    if (type != 'all') {
      filtered = baseState.rawExams
          .where((e) => e.activityType == type)
          .toList();
    }

    final groupedMap = <String, List<Exam>>{};
    for (final exam in filtered) {
      groupedMap.putIfAbsent(exam.courseName, () => []).add(exam);
    }

    final groups = groupedMap.entries
        .map((entry) => CourseGroup(label: entry.key, exams: entry.value))
        .toList();

    final total = filtered.length;
    final scored = filtered
        .where((e) => baseState.resolvedScores.containsKey(e.id))
        .length;
    final pending = total - scored;

    return baseState.copyWith(
      filterType: type,
      groupedExams: groups,
      totalExams: total,
      scoredCount: scored,
      pendingCount: pending,
    );
  }

  Future<void> setFilter(String type) async {
    final curState = state.value;
    if (curState == null) return;
    state = AsyncValue.data(_applyFilter(curState, type));
  }

  Future<void> refresh() async {
    ref.invalidate(notificationsProvider);
    final academicAsync = ref.read(academicProvider);
    final academic = academicAsync.value;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => _initialFetch(academic: academic, bypassCache: true),
    );
  }

  bool _matchesAcademic(Exam exam, AcademicState? academic) {
    if (academic == null) return true;
    if (exam.courses.isEmpty) return true;
    return exam.courses.any((c) {
      final sem = c.academicSemester;
      final year = c.academicYear;
      if (sem != null && sem != academic.semester) return false;
      if (year != null && year != academic.year) return false;
      return true;
    });
  }

  Future<void> _loadExamDetails({
    required Exam exam,
    required ApiService api,
    required SecureStorageService storage,
    required Map<int, List<ExamQuestion>> questionsMap,
    required Map<int, List<ExamAnswer>> answersMap,
    required Map<int, ResolvedScore> resolvedScores,
    bool bypassCache = false,
  }) async {
    final cacheKeyQs = 'exam_questions_${exam.id}';
    final cacheKeyAns = 'exam_answers_${exam.id}';

    dynamic qsData;
    dynamic ansData;

    if (!bypassCache) {
      final cacheResults = await Future.wait([
        storage.getCachedData(cacheKeyQs),
        storage.getCachedData(cacheKeyAns),
      ]);
      qsData = cacheResults[0];
      ansData = cacheResults[1];
    }

    if (qsData == null || ansData == null) {
      final results = await Future.wait([
        api.fetchExamQuestions(exam.id, storage),
        api.fetchExamAnswers(exam.id, storage),
      ]);

      qsData = results[0].data;
      ansData = results[1].data;

      if (results[0].statusCode == 200 && qsData != null) {
        await storage.saveCachedData(cacheKeyQs, qsData);
      }
      if (results[1].statusCode == 200 && ansData != null) {
        await storage.saveCachedData(cacheKeyAns, ansData);
      }
    }

    final qs = (qsData is List<dynamic> ? qsData : <dynamic>[])
        .map((j) => ExamQuestion.fromJson(j as Map<String, dynamic>))
        .toList();
    final ans = (ansData is List<dynamic> ? ansData : <dynamic>[])
        .map((j) => ExamAnswer.fromJson(j as Map<String, dynamic>))
        .toList();

    // Deduplicate questions and answers to prevent inflation from API duplicates
    final uniqueQuestions = {for (final q in qs) q.id: q}.values.toList();
    final uniqueAnswers = {for (final a in ans) a.id: a}.values.toList();

    questionsMap[exam.id] = uniqueQuestions;
    answersMap[exam.id] = uniqueAnswers;

    double? finalScore;
    final hasAnyGrade =
        uniqueAnswers.isNotEmpty && uniqueAnswers.any((a) => a.score != null);

    if (hasAnyGrade) {
      finalScore = uniqueAnswers.fold<double>(
        0,
        (sum, a) => sum + (a.score ?? 0.0),
      );
    } else {
      finalScore = exam.apiScore;
    }

    // --- Robust Max Mark Calculation (matches web app) ---
    var finalMax = exam.maximumMark;

    if (finalMax == null || finalMax == 0) {
      if (uniqueQuestions.isNotEmpty) {
        // Identify parent IDs
        final parentIds = uniqueQuestions
            .map((q) => q.subquestionParentId)
            .where((id) => id != null)
            .toSet();

        // Leaves are questions that are not parents
        final leaves = uniqueQuestions
            .where((q) => !parentIds.contains(q.id))
            .toList();

        // Identify graded question IDs
        final gradedQuestionIds = uniqueAnswers
            .where((a) => a.score != null)
            .map((a) => a.examQuestionId)
            .toSet();

        // If some leaves were graded, only count those (handles optional papers)
        final gradedLeaves = leaves
            .where((q) => gradedQuestionIds.contains(q.id))
            .toList();
        final targetSet = gradedLeaves.isNotEmpty ? gradedLeaves : leaves;

        // Handle OR-groups
        final orGroups = <int, double>{};
        var total = 0.0;

        for (final q in targetSet) {
          if (q.orQuestionGroupId != null) {
            final groupId = q.orQuestionGroupId!;
            orGroups[groupId] = (orGroups[groupId] ?? 0.0) > q.maximumMark
                ? orGroups[groupId]!
                : q.maximumMark;
          } else {
            total += q.maximumMark;
          }
        }

        for (final groupMark in orGroups.values) {
          total += groupMark;
        }

        finalMax = total;
      }
    }

    if (finalScore != null) {
      final m = finalMax;
      final isMaxUnresolvable = m == null || m <= 0;
      resolvedScores[exam.id] = ResolvedScore(
        score: finalScore,
        maxMark: isMaxUnresolvable ? 0.0 : m,
        isMarked: true,
        isMaxUnresolvable: isMaxUnresolvable,
      );
    }
  }
}
