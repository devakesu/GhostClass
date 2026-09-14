import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/logic/attendance_utils.dart';
import 'package:ghostclass/logic/error_utils.dart';
import 'package:ghostclass/models/score.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/logger.dart';
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
  bool _isDisposed = false;

  @override
  Future<ScoreState> build() async {
    _isDisposed = false;
    ref.onDispose(() => _isDisposed = true);

    final authState = ref.watch(authProvider);
    final academicAsync = ref.watch(academicProvider);

    if (authState.isLoading || academicAsync.isLoading) {
      await Future.wait([
        if (authState.isLoading) ref.watch(authProvider.future),
        if (academicAsync.isLoading) ref.watch(academicProvider.future),
      ]);
    }

    final user = authState.value;
    if (user == null) {
      throw Exception('Unauthorized');
    }

    final academic = academicAsync.value;

    // Fast path: Attempt to hydrate from disk cache for instant boot (<15ms)
    final cached = await _tryHydrateFromCache(user: user, academic: academic);
    if (cached != null) {
      AppLogger.safeUnawait(
        _initialFetch(user: user, academic: academic, bypassCache: true)
            .then((fresh) {
              if (!_isDisposed) {
                state = AsyncValue.data(fresh);
              }
            })
            .catchError((Object e, StackTrace st) {
              if (!_isDisposed) {
                AppLogger.e(
                  'ScoreNotifier: Background revalidate failed',
                  e,
                  st,
                );
              }
            }),
        'ScoreNotifier: background revalidate',
      );
      return cached;
    }

    return _initialFetch(user: user, academic: academic);
  }

  Future<ScoreState?> _tryHydrateFromCache({
    required AuthenticatedUser user,
    required AcademicState? academic,
  }) async {
    final storage = ref.read(secureStorageProvider);
    final semSuffix =
        academic != null ? '_${academic.semester}_${academic.year}' : '';
    final examsCacheKey = 'scores_exams_${user.supabaseUserId}$semSuffix';

    try {
      var cachedExamsRaw = await storage.getCachedData(examsCacheKey);
      if (cachedExamsRaw is! List && semSuffix.isNotEmpty) {
        cachedExamsRaw = await storage.getCachedData(
          'scores_exams_${user.supabaseUserId}',
        );
      }
      if (cachedExamsRaw is! List) return null;

      final allExams = cachedExamsRaw
          .whereType<Map<dynamic, dynamic>>()
          .map((j) => Exam.fromJson(j.cast<String, dynamic>()))
          .toList();

      final participatedExams = allExams
          .where((e) => e.courses.isNotEmpty)
          .toList();
      final targetExams = participatedExams
          .where((e) => _matchesAcademic(e, academic))
          .toList();

      if (targetExams.isEmpty) {
        return null;
      }

      final questionsMap = <int, List<ExamQuestion>>{};
      final answersMap = <int, List<ExamAnswer>>{};
      final resolvedScores = <int, ResolvedScore>{};

      final detailReads = await Future.wait(
        targetExams.map((exam) async {
          final q = await storage.getCachedData('exam_questions_${exam.id}');
          final a = await storage.getCachedData('exam_answers_${exam.id}');
          return (exam: exam, questions: q, answers: a);
        }),
      );

      for (final read in detailReads) {
        if (read.questions is! List || read.answers is! List) {
          return null;
        }

        final qs = (read.questions as List)
            .whereType<Map<dynamic, dynamic>>()
            .map((j) => ExamQuestion.fromJson(j.cast<String, dynamic>()))
            .toList();
        final ans = (read.answers as List)
            .whereType<Map<dynamic, dynamic>>()
            .map((j) => ExamAnswer.fromJson(j.cast<String, dynamic>()))
            .toList();

        final uniqueQuestions = {for (final q in qs) q.id: q}.values.toList();
        final uniqueAnswers = {for (final a in ans) a.id: a}.values.toList();

        questionsMap[read.exam.id] = uniqueQuestions;
        answersMap[read.exam.id] = uniqueAnswers;

        _computeExamScore(
          exam: read.exam,
          uniqueQuestions: uniqueQuestions,
          uniqueAnswers: uniqueAnswers,
          resolvedScores: resolvedScores,
        );
      }

      final visibleExams = targetExams.where((e) {
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

      return _applyFilter(
        state,
        'all',
        totalExams: visibleExams.length,
        scoredCount: scored,
        pendingCount: pending,
      );
    } on Object catch (e) {
      AppLogger.e('ScoreNotifier: Error hydrating from disk cache', e);
      return null;
    }
  }

  Future<ScoreState> _initialFetch({
    required AuthenticatedUser user,
    AcademicState? academic,
    bool bypassCache = false,
  }) async {
    final api = ref.read(apiServiceProvider);
    final storage = ref.read(secureStorageProvider);

    try {
      final examsRes = await api.fetchExams(storage);

      if (examsRes.statusCode != 200 || examsRes.data is! List) {
        throw Exception(formatApiError(examsRes.data, 'Scores.Exams'));
      }

      final examsJson = examsRes.data as List<dynamic>;

      // Cache raw exams list for future offline/instant hydration per-academic and general
      final semSuffix =
          academic != null ? '_${academic.semester}_${academic.year}' : '';
      AppLogger.safeUnawait(
        Future.wait([
          storage.saveCachedData(
            'scores_exams_${user.supabaseUserId}$semSuffix',
            examsJson,
          ),
          storage.saveCachedData(
            'scores_exams_${user.supabaseUserId}',
            examsJson,
          ),
        ]).catchError((Object e, StackTrace st) {
          AppLogger.e('ScoreNotifier: Failed to cache raw exams', e, st);
          return <void>[];
        }),
        'ScoreNotifier: saveCachedData exams',
      );

      final allExams = examsJson
          .map((j) => Exam.fromJson(j as Map<String, dynamic>))
          .toList();

      // Only show exams where I am a participant
      final participatedExams = allExams.where((e) {
        return e.courses.isNotEmpty;
      }).toList();

      final questionsMap = <int, List<ExamQuestion>>{};
      final answersMap = <int, List<ExamAnswer>>{};
      final resolvedScores = <int, ResolvedScore>{};

      // Batch Resolve Details ONLY for the active academic period.
      // Avoids loading questions and answers for dozens of previous-year exams.
      final targetExams = participatedExams
          .where((e) => _matchesAcademic(e, academic))
          .toList();

      const poolSize = 5;
      for (var i = 0; i < targetExams.length; i += poolSize) {
        final slice = targetExams.skip(i).take(poolSize);
        await Future.wait(
          slice.map(
            (exam) async {
              try {
                await _loadExamDetails(
                  exam: exam,
                  api: api,
                  storage: storage,
                  questionsMap: questionsMap,
                  answersMap: answersMap,
                  resolvedScores: resolvedScores,
                  bypassCache: bypassCache,
                );
              } on Object catch (err, st) {
                AppLogger.e(
                  'Failed to load details for exam ${exam.id}',
                  err,
                  st,
                );
              }
            },
          ),
        );
      }

      // ─── Filter Visible Exams (Academic Context & Assignments) ───────────
      final visibleExams = targetExams.where((e) {
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

      return _applyFilter(
        state,
        'all',
        totalExams: visibleExams.length,
        scoredCount: scored,
        pendingCount: pending,
      );
    } on Object catch (e) {
      throw Exception('Failed to load internal marks: $e');
    }
  }

  ScoreState _applyFilter(
    ScoreState baseState,
    String type, {
    int? totalExams,
    int? scoredCount,
    int? pendingCount,
  }) {
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

    final total = totalExams ?? filtered.length;
    final scored =
        scoredCount ??
        filtered
            .where((e) => baseState.resolvedScores.containsKey(e.id))
            .length;
    final pending = pendingCount ?? (total - scored);

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
    final user = ref.read(authProvider).value;
    if (user == null) {
      state = AsyncValue.error(Exception('Unauthorized'), StackTrace.current);
      return;
    }
    final academicAsync = ref.read(academicProvider);
    final academic = academicAsync.value;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => _initialFetch(user: user, academic: academic, bypassCache: true),
    );
  }

  bool _matchesAcademic(Exam exam, AcademicState? academic) {
    if (academic == null) return true;

    final windowStart = academic.startDate.subtract(const Duration(days: 30));
    final windowEnd = academic.endDate.add(const Duration(days: 30));

    // If courses exist on the exam, check their academic metadata
    if (exam.courses.isNotEmpty) {
      final coursesWithAcademic = exam.courses.where(
        (c) =>
            (c.academicSemester != null &&
                c.academicSemester!.trim().isNotEmpty) ||
            (c.academicYear != null && c.academicYear!.trim().isNotEmpty),
      );

      if (coursesWithAcademic.isNotEmpty) {
        return coursesWithAcademic.any((c) {
          final sem = c.academicSemester?.trim();
          final year = c.academicYear?.trim();

          // If course specifies semester, it MUST match the academic semester
          if (sem != null && sem.isNotEmpty) {
            if (semestersDiffer(sem, academic.semester)) return false;
          }

          // If course specifies year, it MUST match the academic year
          if (year != null && year.isNotEmpty) {
            if (yearsDiffer(year, academic.year)) return false;
          } else if (exam.date != null) {
            // If year is omitted on course, verify date falls within semester window
            if (!exam.date!.isAfter(windowStart) ||
                !exam.date!.isBefore(windowEnd)) {
              return false;
            }
          }

          return true;
        });
      }
    }

    // Fallback: If no course has explicit semester/year metadata, use exam date
    if (exam.date != null) {
      return exam.date!.isAfter(windowStart) && exam.date!.isBefore(windowEnd);
    }

    return false;
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
      try {
        final results = await Future.wait([
          api.fetchExamQuestions(exam.id, storage),
          api.fetchExamAnswers(exam.id, storage),
        ]);

        if (results[0].statusCode == 200 && results[0].data is List) {
          qsData = results[0].data;
          storage.saveCachedData(cacheKeyQs, qsData).ignore();
        }
        if (results[1].statusCode == 200 && results[1].data is List) {
          ansData = results[1].data;
          storage.saveCachedData(cacheKeyAns, ansData).ignore();
        }
      } on Object catch (e, st) {
        AppLogger.e(
          'ScoreNotifier: Network fetch for exam ${exam.id} failed',
          e,
          st,
        );
      }

      // If network fetch failed or returned invalid data, fall back to cached data
      if (qsData == null || ansData == null) {
        final fallback = await Future.wait([
          storage.getCachedData(cacheKeyQs),
          storage.getCachedData(cacheKeyAns),
        ]);
        qsData ??= fallback[0];
        ansData ??= fallback[1];
      }
    }

    final qs = (qsData is List<dynamic> ? qsData : <dynamic>[])
        .whereType<Map<dynamic, dynamic>>()
        .map((j) => ExamQuestion.fromJson(j.cast<String, dynamic>()))
        .toList();
    final ans = (ansData is List<dynamic> ? ansData : <dynamic>[])
        .whereType<Map<dynamic, dynamic>>()
        .map((j) => ExamAnswer.fromJson(j.cast<String, dynamic>()))
        .toList();

    // Deduplicate questions and answers to prevent inflation from API duplicates
    final uniqueQuestions = {for (final q in qs) q.id: q}.values.toList();
    final uniqueAnswers = {for (final a in ans) a.id: a}.values.toList();

    questionsMap[exam.id] = uniqueQuestions;
    answersMap[exam.id] = uniqueAnswers;

    _computeExamScore(
      exam: exam,
      uniqueQuestions: uniqueQuestions,
      uniqueAnswers: uniqueAnswers,
      resolvedScores: resolvedScores,
    );
  }

  void _computeExamScore({
    required Exam exam,
    required List<ExamQuestion> uniqueQuestions,
    required List<ExamAnswer> uniqueAnswers,
    required Map<int, ResolvedScore> resolvedScores,
  }) {
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
