import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ghostclass/models/score.dart';
import 'package:ghostclass/providers/auth_provider.dart';
import 'package:ghostclass/providers/academic_provider.dart';
import 'package:ghostclass/services/api_service.dart';
import 'package:ghostclass/services/secure_storage.dart';
import 'package:ghostclass/logic/error_utils.dart';

final scoreProvider = AsyncNotifierProvider<ScoreNotifier, ScoreState>(
  ScoreNotifier.new,
);

class ScoreState {
  final List<Exam> rawExams;
  final List<CourseGroup> groupedExams;
  final Map<int, List<ExamQuestion>> questions;
  final Map<int, List<ExamAnswer>> answers;
  final Map<int, ResolvedScore> resolvedScores;
  final String filterType;
  final int totalExams;
  final int scoredCount;
  final int pendingCount;

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
  final String label;
  final List<Exam> exams;
  CourseGroup({required this.label, required this.exams});
}

class ScoreNotifier extends AsyncNotifier<ScoreState> {
  @override
  Future<ScoreState> build() async {
    final academicAsync = ref.watch(academicProvider);
    final academic = academicAsync.value;
    return _initialFetch(academic: academic);
  }

  Future<ScoreState> _initialFetch({AcademicState? academic}) async {
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

      final List<dynamic> examsJson = examsRes.data;
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

      final int scored = visibleExams
          .where((e) => resolvedScores.containsKey(e.id))
          .length;
      final int pending = visibleExams.length - scored;

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
    List<Exam> filtered = baseState.rawExams;
    if (type != 'all') {
      filtered = baseState.rawExams
          .where((e) => e.activityType == type)
          .toList();
    }

    final Map<String, List<Exam>> groupedMap = {};
    for (final exam in filtered) {
      groupedMap.putIfAbsent(exam.courseName, () => []).add(exam);
    }

    final groups = groupedMap.entries
        .map((entry) => CourseGroup(label: entry.key, exams: entry.value))
        .toList();

    final int total = filtered.length;
    final int scored = filtered
        .where((e) => baseState.resolvedScores.containsKey(e.id))
        .length;
    final int pending = total - scored;

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
    final academicAsync = ref.read(academicProvider);
    final academic = academicAsync.value;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _initialFetch(academic: academic));
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
  }) async {
    final results = await Future.wait([
      api.fetchExamQuestions(exam.id, storage),
      api.fetchExamAnswers(exam.id, storage),
    ]);

    final qsData = results[0].data;
    final ansData = results[1].data;

    final qs = (qsData is List ? qsData : [])
        .map((j) => ExamQuestion.fromJson(j as Map<String, dynamic>))
        .toList();
    final ans = (ansData is List ? ansData : [])
        .map((j) => ExamAnswer.fromJson(j as Map<String, dynamic>))
        .toList();

    questionsMap[exam.id] = qs;
    answersMap[exam.id] = ans;

    double? finalScore = exam.apiScore;
    final bool hasAnyGrade = ans.isNotEmpty && ans.any((a) => a.score != null);

    if (hasAnyGrade) {
      finalScore = ans.fold<double>(0.0, (sum, a) => sum + (a.score ?? 0.0));
    }

    double? finalMax = exam.maximumMark;
    final double summedMax = qs.fold<double>(
      0.0,
      (sum, q) => sum + q.maximumMark,
    );
    if (finalMax == null || finalMax == 0) {
      finalMax = summedMax;
    }

    if (finalScore != null) {
      resolvedScores[exam.id] = ResolvedScore(
        score: finalScore,
        maxMark: finalMax > 0 ? finalMax : summedMax,
        isMarked: true,
      );
    }
  }
}
