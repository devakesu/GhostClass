allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

// Workaround: sentry_flutter declares `SentryFlutterReplayRecorder.kt` which imports
// `io.sentry.android.replay.*`, but only declares `io.sentry:sentry-android` as a
// dependency (not `sentry-android-replay`). With Kotlin 2.x K2 compiler, any file
// with unresolved imports is fully excluded from the module's symbol table, so
// SentryFlutterReplayRecorder is invisible to SentryFlutterPlugin.kt.
// Fix: after all project build.gradle files are evaluated, inject sentry-android-replay
// with the same version that sentry_flutter already uses for sentry-android.
// This avoids touching any Android DSL (no LibraryExtension/new-DSL conflicts).
gradle.projectsEvaluated {
    val sentryProject = subprojects.find { it.name == "sentry_flutter" } ?: return@projectsEvaluated
    val sentryAndroidVersion = sentryProject.configurations
        .flatMap { it.dependencies }
        .firstOrNull { it.group == "io.sentry" && it.name == "sentry-android" }
        ?.version ?: return@projectsEvaluated
    sentryProject.dependencies.add(
        "implementation",
        "io.sentry:sentry-android-replay:$sentryAndroidVersion"
    )
}
